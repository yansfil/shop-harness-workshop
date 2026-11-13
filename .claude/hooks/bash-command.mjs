// Bash 명령 문자열을 Hook이 판정할 "단순 명령" 목록으로 펼친다. guard-bash·protect-files·stop-verify가 같이 쓴다.
//
// 펼치는 것:
//   - `;` `&&` `||` `|` `&` 줄바꿈으로 이어 붙인 명령, `( ... )` 서브셸
//   - `$( ... )`, 백틱, `<( ... )` 안의 명령, `bash -c '...'`·`sh -c`·`eval`의 문자열, 셸에 넘긴 heredoc
//   - 앞에 붙은 `VAR=값`, `env`, `command`, `sudo`, `nohup`, `timeout 30`, `xargs` 같은 실행 접두어
//   - `find ... -exec rm {} \;`의 실행 명령
//   - `cd`로 바뀐 작업 폴더(서브셸이 끝나면 되돌린다). 알 수 없는 폴더(`cd $X`, `cd -`)면 null
// 따옴표 밖의 역슬래시 뒤에 글자·숫자·`.`·`-`·`_`가 오면 Windows 경로 구분자로 보고 남긴다(`packages\db\x.sql`).
import os from "node:os";
import path from "node:path";

const PATH_CHAR = /[A-Za-z0-9._-]/;
const MAX_DEPTH = 8;

export function toSlash(text) {
  return text.replaceAll("\\", "/");
}

/** `/usr/bin/git`, `git.exe` → `git` */
export function commandName(word) {
  if (word === undefined) return "";
  return toSlash(word).split("/").pop().replace(/\.(exe|cmd|bat)$/i, "");
}

function newRaw() {
  return { words: [], redirects: [], inputs: [], nested: [] };
}

/** 여는 괄호 바로 뒤(start)부터 짝이 맞는 닫는 괄호까지. 따옴표 안의 괄호는 세지 않는다. */
function readBalanced(src, start) {
  let depth = 1;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"') i += 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "\\") i += 1;
    else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return { text: src.slice(start, i), end: i + 1 };
    }
  }
  return { text: src.slice(start), end: src.length };
}

function readBacktick(src, start) {
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "\\") i += 1;
    else if (src[i] === "`") return { text: src.slice(start, i), end: i + 1 };
  }
  return { text: src.slice(start), end: src.length };
}

const REDIRECT_OPS = ["<<<", "<<-", "&>>", "<<", ">>", ">|", ">&", "<&", "<>", "&>", ">", "<"];

/** 명령 문자열을 단순 명령(raw)과 서브셸 열기·닫기 이벤트로 나눈다. */
function lex(src) {
  const events = [];
  let raw = newRaw();
  let word = null;
  let pending = null;
  let heredocQueue = [];

  const append = (text) => {
    word ??= { text: "" };
    word.text += text;
  };
  const flushWord = () => {
    if (word === null) return;
    if (pending !== null) {
      if (pending.op === "<<" || pending.op === "<<-") {
        const heredoc = { delimiter: word.text, strip: pending.op === "<<-", body: "" };
        heredocQueue.push({ heredoc, raw });
      } else if (pending.op === "<<<") {
        raw.inputs.push(word.text);
      } else {
        raw.redirects.push({ op: pending.op, fd: pending.fd, target: word.text });
      }
      pending = null;
    } else {
      raw.words.push(word.text);
    }
    word = null;
  };
  const endCommand = () => {
    flushWord();
    if (raw.words.length > 0 || raw.redirects.length > 0 || raw.inputs.length > 0 || raw.nested.length > 0) events.push({ kind: "command", raw });
    raw = newRaw();
  };
  const substitution = (text, rawText) => {
    raw.nested.push(text);
    append(rawText);
  };

  let i = 0;
  const readHeredocs = () => {
    for (const { heredoc, raw: owner } of heredocQueue) {
      const lines = [];
      let found = false;
      while (i < src.length) {
        const lineEnd = src.indexOf("\n", i);
        const line = src.slice(i, lineEnd === -1 ? src.length : lineEnd);
        i = lineEnd === -1 ? src.length : lineEnd + 1;
        if ((heredoc.strip ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) {
          found = true;
          break;
        }
        lines.push(line);
      }
      heredoc.body = lines.join("\n");
      owner.inputs.push(heredoc.body);
      if (!found) break;
    }
    heredocQueue = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      append(src.slice(i + 1, stop));
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      append("");
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length && '"\\$`\n'.includes(src[i + 1])) {
          if (src[i + 1] !== "\n") append(src[i + 1]);
          i += 2;
        } else if (src[i] === "$" && src[i + 1] === "(") {
          const { text, end } = readBalanced(src, i + 2);
          substitution(text, src.slice(i, end));
          i = end;
        } else if (src[i] === "`") {
          const { text, end } = readBacktick(src, i + 1);
          substitution(text, src.slice(i, end));
          i = end;
        } else {
          append(src[i]);
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    if (c === "\\") {
      const next = src[i + 1];
      if (next === "\n") i += 2;
      else if (next !== undefined && PATH_CHAR.test(next)) {
        append("\\");
        i += 1;
      } else {
        append(next ?? "");
        i += 2;
      }
      continue;
    }
    if (c === "$" && src[i + 1] === "(") {
      const { text, end } = readBalanced(src, i + 2);
      substitution(text, src.slice(i, end));
      i = end;
      continue;
    }
    if (c === "`") {
      const { text, end } = readBacktick(src, i + 1);
      substitution(text, src.slice(i, end));
      i = end;
      continue;
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(" && word === null) {
      const { text, end } = readBalanced(src, i + 2);
      substitution(text, src.slice(i, end));
      i = end;
      continue;
    }
    if (c === "#" && word === null) {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flushWord();
      i += 1;
      continue;
    }
    if (c === "\n") {
      endCommand();
      i += 1;
      readHeredocs();
      continue;
    }
    if (c === "&" && src[i + 1] === ">") {
      flushWord();
      const op = src[i + 2] === ">" ? "&>>" : "&>";
      pending = { op, fd: null };
      i += op.length;
      continue;
    }
    if (c === ";" || c === "&" || c === "|") {
      endCommand();
      i += src[i + 1] === c || (c === "|" && src[i + 1] === "&") ? 2 : 1;
      continue;
    }
    if (c === "(" && word === null) {
      endCommand();
      events.push({ kind: "open" });
      i += 1;
      continue;
    }
    if (c === ")") {
      endCommand();
      events.push({ kind: "close" });
      i += 1;
      continue;
    }
    if (c === "<" || c === ">") {
      let fd = null;
      if (word !== null && /^\d+$/.test(word.text)) {
        fd = word.text;
        word = null;
      } else {
        flushWord();
      }
      const op = REDIRECT_OPS.find((candidate) => src.startsWith(candidate, i));
      pending = { op, fd };
      i += op.length;
      continue;
    }
    append(c);
    i += 1;
  }
  endCommand();
  readHeredocs();
  return events;
}

// 실행 접두어와 그 옵션 중 값을 하나 더 받는 것. positional은 접두어 뒤에 오는 값 인자 수(timeout 30).
const PREFIXES = {
  env: { valueOptions: ["-u", "--unset", "-C", "--chdir"], assignments: true },
  command: { valueOptions: [] },
  builtin: { valueOptions: [] },
  exec: { valueOptions: ["-a"] },
  nohup: { valueOptions: [] },
  time: { valueOptions: ["-f", "-o"] },
  sudo: { valueOptions: ["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U", "-T"] },
  doas: { valueOptions: ["-u", "-C"] },
  nice: { valueOptions: ["-n"] },
  ionice: { valueOptions: ["-c", "-n", "-p"] },
  stdbuf: { valueOptions: ["-i", "-o", "-e"] },
  timeout: { valueOptions: ["-s", "--signal", "-k", "--kill-after"], positional: 1 },
  xargs: { valueOptions: ["-I", "-n", "-P", "-L", "-d", "-a", "-E", "-s"] },
};
const LEADING_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const CLOSING_WORDS = new Set(["fi", "done", "esac", "}"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** 앞의 변수 대입·키워드·실행 접두어를 떼어 실제로 실행되는 명령의 argv를 남긴다. */
function unwrap(words) {
  let argv = [...words];
  for (;;) {
    const before = argv.length;
    while (argv.length > 0 && (ASSIGNMENT.test(argv[0]) || LEADING_KEYWORDS.has(argv[0]))) argv.shift();
    const prefix = PREFIXES[commandName(argv[0])];
    if (prefix !== undefined) {
      argv.shift();
      while (argv.length > 0) {
        const head = argv[0];
        if (head === "--") {
          argv.shift();
          break;
        }
        if ((head === "-S" || head === "--split-string") && argv.length > 1) {
          argv = [...argv[1].split(/\s+/).filter(Boolean), ...argv.slice(2)];
          break;
        }
        if (prefix.valueOptions.includes(head)) argv.splice(0, 2);
        else if (head.startsWith("-")) argv.shift();
        else if (prefix.assignments && ASSIGNMENT.test(head)) argv.shift();
        else break;
      }
      argv.splice(0, prefix.positional ?? 0);
    }
    if (argv.length === before) break;
  }
  if (argv.length === 1 && CLOSING_WORDS.has(argv[0])) return [];
  return argv;
}

function expandKnown(target, cwd) {
  const home = os.homedir();
  let text = target.replace(/^~(?=[\\/]|$)/, home);
  text = text.replace(/\$\{?(HOME|CLAUDE_PROJECT_DIR|PWD)\}?/g, (_, name) => {
    if (name === "HOME") return home;
    if (name === "PWD") return cwd ?? "$PWD";
    return process.env.CLAUDE_PROJECT_DIR ?? "$CLAUDE_PROJECT_DIR";
  });
  return toSlash(text);
}

function changeDirectory(cwd, target) {
  if (target === undefined) return os.homedir();
  if (target === "-") return null;
  const expanded = expandKnown(target, cwd);
  if (/[$`*?]/.test(expanded)) return null;
  if (cwd === null && !path.isAbsolute(expanded)) return null;
  return path.resolve(cwd ?? "/", expanded);
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/**
 * 명령 문자열을 단순 명령 목록으로 펼친다.
 * 각 항목: { argv, redirects: [{ op, fd, target }], inputs: [heredoc·here-string 본문], cwd: 절대 경로 또는 null }
 */
export function simpleCommands(command, cwd) {
  const out = [];
  walk(String(command), cwd, out, 0);
  return out;
}

function walk(src, startCwd, out, depth) {
  if (depth > MAX_DEPTH) return;
  const stack = [];
  let cwd = startCwd;
  for (const event of lex(src)) {
    if (event.kind === "open") {
      stack.push(cwd);
      continue;
    }
    if (event.kind === "close") {
      if (stack.length > 0) cwd = stack.pop();
      continue;
    }
    const { raw } = event;
    for (const nested of raw.nested) walk(nested, cwd, out, depth + 1);
    const argv = unwrap(raw.words);
    out.push({ argv, redirects: raw.redirects, inputs: raw.inputs, cwd });
    const name = commandName(argv[0]);
    if (SHELLS.has(name)) {
      const flag = argv.findIndex((word, index) => index > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(word));
      if (flag !== -1 && argv[flag + 1] !== undefined) walk(argv[flag + 1], cwd, out, depth + 1);
      else if (argv.slice(1).every((word) => word.startsWith("-"))) for (const input of raw.inputs) walk(input, cwd, out, depth + 1);
    } else if (name === "eval") {
      walk(argv.slice(1).join(" "), cwd, out, depth + 1);
    } else if (name === "find") {
      for (let index = 1; index < argv.length; index += 1) {
        if (!["-exec", "-execdir", "-ok", "-okdir"].includes(argv[index])) continue;
        const end = argv.findIndex((word, at) => at > index && (word === ";" || word === "+"));
        const inner = argv.slice(index + 1, end === -1 ? argv.length : end);
        out.push({ argv: unwrap(inner), redirects: [], inputs: [], cwd });
      }
    } else if (name === "cd" || name === "pushd") {
      cwd = changeDirectory(cwd, argv.slice(1).find((word) => !word.startsWith("-") || word === "-"));
    } else if (name === "popd") {
      cwd = null;
    }
  }
}

// ---- 판정 도우미 ----

const READ_ONLY = new Set([
  "cat", "head", "tail", "less", "more", "wc", "grep", "egrep", "fgrep", "rg", "ls", "tree", "stat", "file",
  "echo", "printf", "pwd", "which", "type", "cd", "pushd", "popd", "true", "false", "test", "[", "diff", "cmp",
  "sha256sum", "shasum", "md5", "md5sum", "date", "sleep", "jq", "basename", "dirname", "realpath", "readlink",
  "du", "df", "ps", "nl", "cut", "tr", "column", "export", "set", "unset", "local", "for", "case",
]);
const GIT_READ_ONLY = new Set([
  "status", "diff", "log", "show", "blame", "ls-files", "ls-tree", "grep", "rev-parse", "cat-file", "describe",
  "shortlog", "reflog", "add", "commit", "push", "fetch", "remote", "branch", "tag",
]);
const FIND_WRITES = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"]);
const NPM_READ_ONLY = new Set(["run", "run-script", "test", "t", "ls", "view", "outdated"]);
const COPY_LIKE = new Set(["cp", "install", "ln", "rsync"]);
const NULL_DEVICES = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "nul"]);

/** `git -C dir push ...`처럼 앞에 옵션이 붙어도 git의 하위 명령과 그 뒤 인자를 찾는다. */
export function gitSubcommand(argv) {
  if (commandName(argv[0]) !== "git") return null;
  let index = 1;
  while (index < argv.length && argv[index].startsWith("-")) index += argv[index] === "-C" || argv[index] === "-c" ? 2 : 1;
  return index < argv.length ? { name: argv[index], args: argv.slice(index + 1) } : null;
}

/** 파일 내용을 바꾸지 않는 명령이면 true(출력 리다이렉션은 따로 본다). */
export function isReadOnly(simple) {
  const { argv } = simple;
  if (argv.length === 0) return true;
  const name = commandName(argv[0]);
  if (READ_ONLY.has(name)) return true;
  if (name === "sed") return !argv.some((word) => /^-[^-]*i/.test(word) || word.startsWith("--in-place"));
  if (name === "find") return !argv.some((word) => FIND_WRITES.has(word));
  if (name === "git") return GIT_READ_ONLY.has(gitSubcommand(argv)?.name);
  if (name === "npm") return NPM_READ_ONLY.has(argv[1]);
  return false;
}

/** 파일로 나가는 리다이렉션 대상(`> f`, `>> f`, `&> f`, `2> f`). `2>&1`·/dev/null은 뺀다. */
export function outputTargets(simple) {
  return simple.redirects
    .filter(({ op, target }) => [">", ">>", ">|", "&>", "&>>", "<>", ">&"].includes(op) && !(op === ">&" && /^(\d+|-)$/.test(target)))
    .map(({ target }) => target)
    .filter((target) => !NULL_DEVICES.has(toSlash(target).toLowerCase()));
}

function inputTargets(simple) {
  return simple.redirects.filter(({ op, target }) => (op === "<" || op === "<&") && !/^(\d+|-)$/.test(target)).map(({ target }) => target);
}

/** 인자들. `--out=file`은 값 부분도 인자로 본다. */
function argumentsOf(simple) {
  return simple.argv.slice(1).flatMap((word) => (/^--?[\w-]+=/.test(word) ? [word, word.slice(word.indexOf("=") + 1)] : [word]));
}

const INTERPRETERS = {
  node: ["-e", "--eval", "-p", "--print"],
  deno: ["eval"],
  bun: ["-e", "--eval", "-p", "--print"],
  python: ["-c"],
  python3: ["-c"],
  py: ["-c"],
  ruby: ["-e"],
  perl: ["-e", "-E"],
  php: ["-r"],
  osascript: ["-e"],
};

/** node -e·python -c 같은 인라인 스크립트와 인터프리터에 넘긴 heredoc 본문. */
function scriptsOf(simple) {
  const name = commandName(simple.argv[0]).toLowerCase();
  const flags = INTERPRETERS[name];
  if (flags === undefined) return [];
  const scripts = [];
  simple.argv.forEach((word, index) => {
    if (flags.includes(word) && simple.argv[index + 1] !== undefined) scripts.push(simple.argv[index + 1]);
  });
  return [...scripts, ...simple.inputs];
}

/** 스크립트 본문에서 경로처럼 보이는 조각. */
function pathsInScript(script) {
  return script.split(/[^\w./\\-]+/).filter((piece) => piece !== "");
}

/** 명령이 건드리는 경로 전부(읽기 포함). .env처럼 읽기도 막을 파일을 찾을 때 쓴다. */
export function mentionedPaths(simple) {
  return [...argumentsOf(simple), ...outputTargets(simple), ...inputTargets(simple), ...scriptsOf(simple).flatMap(pathsInScript)];
}

/** 명령이 쓰거나 지우거나 옮길 수 있는 경로. 읽기만 하는 명령은 리다이렉션 대상만 남는다. */
export function writeTargets(simple) {
  const targets = [...outputTargets(simple), ...scriptsOf(simple).flatMap(pathsInScript)];
  if (isReadOnly(simple)) return targets;
  const args = argumentsOf(simple);
  if (COPY_LIKE.has(commandName(simple.argv[0]))) {
    const positional = args.filter((word) => !word.startsWith("-"));
    return [...targets, ...positional.slice(-1)];
  }
  return [...targets, ...args];
}

/** 파일을 바꿀 수 있는 명령이면 true. */
export function changesFiles(simple) {
  return !isReadOnly(simple) || outputTargets(simple).length > 0;
}
