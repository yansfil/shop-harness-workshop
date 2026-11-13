// Bash 명령 문자열을 Hook이 판정할 "단순 명령" 목록으로 펼친다. guard-bash·protect-files·stop-verify가 같이 쓴다.
//
// 펼치는 것:
//   - `;` `&&` `||` `|` `&` 줄바꿈으로 이어 붙인 명령, `( ... )` 서브셸
//   - `$( ... )`, 백틱, `<( ... )` 안의 명령, `bash -c '...'`·`sh -c`·`eval`의 문자열, 셸에 넘긴 heredoc
//   - 앞에 붙은 `VAR=값`, `env`, `command`, `sudo`, `nohup`, `timeout 30`, `xargs` 같은 실행 접두어. 값을 받는 옵션은 값까지 뗀다(`sudo --user root`)
//   - git 전역 옵션(`git -C dir`, `git -c k=v`, `git --work-tree .`) 뒤의 하위 명령
//   - `find ... -exec rm {} \;`의 실행 명령
//   - `cd`로 바뀐 작업 폴더(서브셸·`bash -c`가 끝나면 되돌리고, `eval "cd ..."`는 이어 간다). `git -C`·`env -C`는 그 명령 하나에만.
//     알 수 없는 폴더(`cd $X`, `cd -`)면 null
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

// 실행 접두어와 그 옵션. short는 값을 받는 한 글자 옵션(`-u root`, `-uroot`, `-Eu root`),
// long은 값을 받는 긴 옵션(`--user root`, `--user=root`), chdir는 작업 폴더를 바꾸는 옵션, positional은 옵션 뒤 값 인자 수(timeout 30).
const PREFIXES = {
  env: { short: "uCS", long: ["--unset", "--chdir", "--split-string"], chdir: ["-C", "--chdir"] },
  command: { short: "", long: [] },
  builtin: { short: "", long: [] },
  exec: { short: "a", long: [] },
  nohup: { short: "", long: [] },
  time: { short: "fo", long: ["--format", "--output"] },
  sudo: {
    short: "ugpCDrRtUTh",
    long: ["--user", "--group", "--host", "--prompt", "--close-from", "--chdir", "--role", "--type", "--other-user", "--command-timeout", "--chroot"],
    chdir: ["-D", "--chdir"],
  },
  doas: { short: "uC", long: [] },
  nice: { short: "n", long: ["--adjustment"] },
  ionice: { short: "cnp", long: ["--class", "--classdata", "--pid"] },
  stdbuf: { short: "ioe", long: ["--input", "--output", "--error"] },
  timeout: { short: "sk", long: ["--signal", "--kill-after"], positional: 1 },
  xargs: { short: "InPLdaEs", long: ["--max-args", "--max-procs", "--max-lines", "--delimiter", "--arg-file", "--eof", "--max-chars", "--replace"] },
};
// git 전역 옵션(하위 명령 앞). `git -C dir`는 작업 폴더를 바꾼다.
const GIT_GLOBAL = {
  short: "Cc",
  long: ["--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"],
  chdir: ["-C"],
};
const LEADING_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const CLOSING_WORDS = new Set(["fi", "done", "esac", "}"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * argv[start]부터 옵션을 읽는다. 값을 받는 옵션은 그 값까지 함께 넘긴다. `--`나 옵션이 아닌 단어에서 멈춘다.
 * 돌려주는 것: { next: 옵션 다음 위치, values: [[옵션 이름, 값]] }
 */
function readOptions(argv, start, spec) {
  const values = [];
  let index = start;
  while (index < argv.length) {
    const word = argv[index];
    if (word === "--") return { next: index + 1, values };
    if (!word.startsWith("-") || word === "-") break;
    if (word.startsWith("--")) {
      const equals = word.indexOf("=");
      if (equals !== -1) {
        values.push([word.slice(0, equals), word.slice(equals + 1)]);
        index += 1;
      } else if (spec.long.includes(word)) {
        values.push([word, argv[index + 1]]);
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    let step = 1;
    for (let at = 1; at < word.length; at += 1) {
      if (!spec.short.includes(word[at])) continue;
      const inline = word.slice(at + 1);
      values.push([`-${word[at]}`, inline !== "" ? inline : argv[index + 1]]);
      if (inline === "") step = 2;
      break;
    }
    index += step;
  }
  return { next: index, values };
}

/** 옵션 값 중 작업 폴더를 바꾸는 것(`-C dir`, `--chdir=dir`). */
function chdirsOf(values, spec) {
  return values.filter(([name, value]) => (spec.chdir ?? []).includes(name) && value !== undefined).map(([, value]) => value);
}

/**
 * 앞의 변수 대입·키워드·실행 접두어를 떼어 실제로 실행되는 명령의 argv를 남긴다.
 * 돌려주는 것: { argv, chdirs: 접두어 옵션이 바꾼 작업 폴더들(`env -C dir`) }
 */
function unwrap(words) {
  let argv = [...words];
  const chdirs = [];
  for (;;) {
    const before = argv.length;
    while (argv.length > 0 && (ASSIGNMENT.test(argv[0]) || LEADING_KEYWORDS.has(argv[0]))) argv.shift();
    const prefix = PREFIXES[commandName(argv[0])];
    if (prefix !== undefined) {
      const { next, values } = readOptions(argv, 1, prefix);
      chdirs.push(...chdirsOf(values, prefix));
      const split = values.find(([name]) => name === "-S" || name === "--split-string");
      argv = argv.slice(next);
      if (split !== undefined && split[1] !== undefined) argv = [...split[1].split(/\s+/).filter(Boolean), ...argv];
      argv.splice(0, prefix.positional ?? 0);
    }
    if (argv.length === before) break;
  }
  if (argv.length === 1 && CLOSING_WORDS.has(argv[0])) return { argv: [], chdirs };
  return { argv, chdirs };
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

/** 작업 폴더 cwd에서 dirs를 차례로 따라간 폴더. */
function followDirs(cwd, dirs) {
  return dirs.reduce((current, dir) => changeDirectory(current, dir), cwd);
}

/**
 * src를 펼쳐 out에 넣고, 끝났을 때의 작업 폴더를 돌려준다(eval처럼 같은 셸에서 실행한 문자열의 cd를 이어 가려고).
 * 깊이 제한을 넘으면 작업 폴더를 알 수 없으므로 null.
 */
function walk(src, startCwd, out, depth) {
  if (depth > MAX_DEPTH) return null;
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
    // $( ... )·백틱은 서브셸이라 그 안의 cd는 바깥에 남지 않는다.
    for (const nested of raw.nested) walk(nested, cwd, out, depth + 1);
    const { argv, chdirs } = unwrap(raw.words);
    const name = commandName(argv[0]);
    // `env -C dir`, `sudo -D dir`, `git -C dir`는 그 명령 하나의 작업 폴더만 바꾼다.
    const commandCwd = followDirs(cwd, [...chdirs, ...(gitSubcommand(argv)?.chdirs ?? [])]);
    out.push({ argv, redirects: raw.redirects, inputs: raw.inputs, cwd: commandCwd });
    if (SHELLS.has(name)) {
      // bash -c·heredoc은 새 셸이라 그 안의 cd는 바깥에 남지 않는다.
      const flag = argv.findIndex((word, index) => index > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(word));
      if (flag !== -1 && argv[flag + 1] !== undefined) walk(argv[flag + 1], commandCwd, out, depth + 1);
      else if (argv.slice(1).every((word) => word.startsWith("-"))) for (const input of raw.inputs) walk(input, commandCwd, out, depth + 1);
    } else if (name === "eval") {
      // eval은 지금 셸에서 실행하므로 그 안의 cd가 뒤 명령에 이어진다.
      cwd = walk(argv.slice(1).join(" "), cwd, out, depth + 1);
    } else if (name === "find") {
      for (let index = 1; index < argv.length; index += 1) {
        if (!["-exec", "-execdir", "-ok", "-okdir"].includes(argv[index])) continue;
        const end = argv.findIndex((word, at) => at > index && (word === ";" || word === "+"));
        const inner = unwrap(argv.slice(index + 1, end === -1 ? argv.length : end));
        // found: 이 명령의 `{}`가 가리키는 파일의 범위(find의 시작 폴더와 -name 조건).
        out.push({ argv: inner.argv, redirects: [], inputs: [], cwd: followDirs(commandCwd, inner.chdirs), found: findScope(argv) });
      }
    } else if (name === "cd" || name === "pushd") {
      cwd = changeDirectory(cwd, argv.slice(1).find((word) => !word.startsWith("-") || word === "-"));
    } else if (name === "popd") {
      cwd = null;
    }
  }
  return cwd;
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
const COPY_LIKE = new Set(["cp", "install", "ln", "rsync", "mv", "Copy-Item", "Move-Item"]);
// 기존 파일의 내용을 바꾸지 않는 명령(폴더·빈 파일 만들기). 작업 트리는 바뀔 수 있다.
const CREATE_ONLY = new Set(["mkdir", "md", "touch", "New-Item"]);
// 인자를 통째로(폴더면 그 안까지) 지우거나 옮기는 명령. mv는 마지막 인자(목적지)를 뺀다.
const REMOVERS = new Set(["rm", "rmdir", "rd", "del", "unlink", "rimraf", "Remove-Item", "mv", "Move-Item"]);
const GIT_REMOVERS = new Set(["rm", "mv", "clean"]);
// 읽기 전용 명령이지만 값으로 받은 파일에 쓰는 옵션(`git diff --output=f`, `tree -o f`).
const OUTPUT_OPTIONS = { git: ["--output"], tree: ["-o"] };
const NULL_DEVICES = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "nul"]);

/**
 * `git -C dir push`, `git --work-tree . push`처럼 앞에 전역 옵션이 붙어도 git의 하위 명령과 그 뒤 인자를 찾는다.
 * 돌려주는 것: { name, args, chdirs: `-C`로 바꾼 작업 폴더들 }. git이 아니거나 하위 명령이 없으면 null.
 */
export function gitSubcommand(argv) {
  if (commandName(argv[0]) !== "git") return null;
  const { next, values } = readOptions(argv, 1, GIT_GLOBAL);
  if (next >= argv.length) return null;
  return { name: argv[next], args: argv.slice(next + 1), chdirs: chdirsOf(values, GIT_GLOBAL) };
}

/** 파일 내용을 바꾸지 않는 명령이면 true(출력 리다이렉션·출력 옵션은 따로 본다). */
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

/** 출력 옵션이 받은 파일(`--output=f`, `--output f`, `-o f`). */
function optionOutputs(simple) {
  const options = OUTPUT_OPTIONS[commandName(simple.argv[0])] ?? [];
  const targets = [];
  simple.argv.forEach((word, index) => {
    if (index === 0) return;
    const option = options.find((candidate) => word === candidate || word.startsWith(`${candidate}=`));
    if (option === undefined) return;
    const value = word === option ? simple.argv[index + 1] : word.slice(option.length + 1);
    if (value !== undefined) targets.push(value);
  });
  return targets;
}

/** 명령이 직접 쓰는 파일: 출력 리다이렉션(`> f`, `>> f`, `&> f`, `2> f`)과 출력 옵션. `2>&1`·/dev/null은 뺀다. */
export function outputTargets(simple) {
  const redirected = simple.redirects
    .filter(({ op, target }) => [">", ">>", ">|", "&>", "&>>", "<>", ">&"].includes(op) && !(op === ">&" && /^(\d+|-)$/.test(target)))
    .map(({ target }) => target);
  return [...redirected, ...optionOutputs(simple)].filter((target) => !NULL_DEVICES.has(toSlash(target).toLowerCase()));
}

function inputTargets(simple) {
  return simple.redirects.filter(({ op, target }) => (op === "<" || op === "<&") && !/^(\d+|-)$/.test(target)).map(({ target }) => target);
}

/** 인자들. `--out=file`은 값 부분도 인자로 본다. */
function argumentsOf(simple) {
  return simple.argv.slice(1).flatMap((word) => (/^--?[\w-]+=/.test(word) ? [word, word.slice(word.indexOf("=") + 1)] : [word]));
}

function positionalOf(words) {
  return words.filter((word) => !word.startsWith("-"));
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

/** 명령이 건드리는 경로 전부(읽기 포함). 읽기도 막을 파일을 찾을 때 쓴다. */
export function mentionedPaths(simple) {
  return [...argumentsOf(simple), ...outputTargets(simple), ...inputTargets(simple), ...scriptsOf(simple).flatMap(pathsInScript)];
}

/**
 * 명령이 내용을 바꾸거나 지우거나 옮길 수 있는 파일 경로.
 * - 출력 리다이렉션·출력 옵션, node -e·python -c 스크립트 안의 경로
 * - 읽기 전용이 아닌 명령의 인자. 단 mkdir·touch는 기존 파일 내용을 바꾸지 않으므로 인자를 넣지 않는다.
 * - cp·mv는 목적지와 "목적지/원본 이름"(목적지가 폴더일 때 생기는 파일). mv는 원본도 옮겨지므로 넣는다.
 */
export function writeTargets(simple) {
  const targets = [...outputTargets(simple), ...scriptsOf(simple).flatMap(pathsInScript)];
  if (isReadOnly(simple)) return targets;
  const name = commandName(simple.argv[0]);
  if (CREATE_ONLY.has(name)) return targets;
  const args = argumentsOf(simple);
  if (COPY_LIKE.has(name)) {
    const positional = positionalOf(args);
    const destination = positional.at(-1);
    if (destination === undefined) return targets;
    const sources = positional.slice(0, -1);
    const intoFolder = sources.map((source) => `${toSlash(destination).replace(/\/+$/, "")}/${toSlash(source).split("/").pop()}`);
    const moved = REMOVERS.has(name) ? sources : [];
    return [...targets, destination, ...intoFolder, ...moved];
  }
  return [...targets, ...args];
}

/** 명령이 통째로 지우거나 옮기는 경로(폴더면 그 안의 파일 전부). rm·rmdir·mv와 git rm·mv·clean. */
export function removedPaths(simple) {
  const name = commandName(simple.argv[0]);
  if (REMOVERS.has(name)) {
    const positional = positionalOf(simple.argv.slice(1));
    return name === "mv" || name === "Move-Item" ? positional.slice(0, -1) : positional;
  }
  const git = gitSubcommand(simple.argv);
  if (git !== null && GIT_REMOVERS.has(git.name)) {
    const positional = positionalOf(git.args);
    if (git.name === "clean") return positional.length > 0 ? positional : ["."];
    return git.name === "mv" ? positional.slice(0, -1) : positional;
  }
  return [];
}

/** find의 시작 폴더(없으면 `.`)와 -name·-iname 조건. */
export function findScope(argv) {
  const roots = [];
  for (let index = 1; index < argv.length && !/^[-(!]/.test(argv[index]); index += 1) roots.push(argv[index]);
  const names = argv.flatMap((word, index) => ((word === "-name" || word === "-iname") && argv[index + 1] !== undefined ? [argv[index + 1]] : []));
  return { roots: roots.length > 0 ? roots : ["."], names };
}

/**
 * 폴더 아래 파일을 한꺼번에 바꾸거나 지우는 범위: `find <폴더> -delete`, `find <폴더> -exec sed -i ... {} ;`.
 * 돌려주는 것: [{ roots, names }]. 해당 없으면 빈 배열.
 */
export function bulkScopes(simple) {
  if (simple.found !== undefined) return !isReadOnly(simple) && simple.argv.some((word) => word.includes("{}")) ? [simple.found] : [];
  if (commandName(simple.argv[0]) === "find" && simple.argv.includes("-delete")) return [findScope(simple.argv)];
  return [];
}

/** 파일을 바꿀 수 있는 명령이면 true. */
export function changesFiles(simple) {
  return !isReadOnly(simple) || outputTargets(simple).length > 0;
}
