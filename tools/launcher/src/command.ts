// 바깥 명령(claude·npm·git) 찾기와 실행. Mac·Windows 차이는 여기에만 있다.
// Windows에서 npm으로 깐 claude와 npm 자체는 .cmd라 셸(cmd.exe) 없이는 실행되지 않고,
// 셸로 실행할 때는 인자를 직접 따옴표로 묶어야 한다(공백이 든 사용자 폴더 경로).
import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

export interface CommandLookup {
  platform: NodeJS.Platform;
  /** PATH 값(Windows에서는 Path일 수 있다) */
  pathValue: string;
  /** Windows PATHEXT 값. 없으면 기본 목록 */
  pathExt: string | undefined;
  isExecutable: (file: string) => boolean;
}

/** PATH에서 name을 찾아 실행 파일의 전체 경로를 돌려준다. 없으면 null. */
export function findCommand(name: string, lookup: CommandLookup): string | null {
  const windows = lookup.platform === "win32";
  const paths = windows ? path.win32 : path.posix;
  const dirs = lookup.pathValue
    .split(windows ? ";" : ":")
    .map((dir) => (windows ? dir.replace(/^"(.*)"$/, "$1") : dir))
    .filter((dir) => dir !== "");
  const extensions = windows
    ? (lookup.pathExt ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext !== "")
    : [""];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = paths.join(dir, name + ext.toLowerCase());
      if (lookup.isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export interface SpawnSpec {
  command: string;
  args: string[];
  shell: boolean;
}

/** cmd.exe에 넘길 인자 하나를 큰따옴표로 묶는다. cmd가 따옴표 안에서도 바꾸는 " %는 받지 않는다. */
export function quoteForCmd(arg: string): string {
  if (/["%]/.test(arg)) {
    throw new Error(`Windows 셸로 넘길 수 없는 문자(" 또는 %)가 든 인자입니다: ${arg}`);
  }
  return `"${arg}"`;
}

/** 찾은 실행 파일과 인자로 spawn 방식을 정한다. Windows의 .cmd·.bat만 셸을 거친다. */
export function spawnSpec(file: string, args: readonly string[], platform: NodeJS.Platform): SpawnSpec {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
    return { command: [file, ...args].map(quoteForCmd).join(" "), args: [], shell: true };
  }
  return { command: file, args: [...args], shell: false };
}

function isExecutableHere(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (process.platform !== "win32") accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 이 컴퓨터의 PATH에서 찾는다. */
export function findHere(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return findCommand(name, {
    platform: process.platform,
    pathValue: env.PATH ?? env.Path ?? "",
    pathExt: env.PATHEXT,
    isExecutable: isExecutableHere,
  });
}

export interface Captured {
  status: number;
  stdout: string;
  stderr: string;
}

/** 끝날 때까지 기다리며 출력을 모은다. */
export function capture(file: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Captured {
  const spec = spawnSpec(file, args, process.platform);
  const result = spawnSync(spec.command, spec.args, { cwd: options.cwd, env: options.env, shell: spec.shell, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/** 끝날 때까지 기다리며 출력은 터미널에 그대로 보인다(npm ci 등). */
export function runVisible(file: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): number {
  const spec = spawnSpec(file, args, process.platform);
  const result = spawnSync(spec.command, spec.args, { cwd: options.cwd, env: options.env, shell: spec.shell, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function spawnInteractive(file: string, args: readonly string[], options: SpawnOptions & { cwd: string }) {
  const spec = spawnSpec(file, args, process.platform);
  return spawn(spec.command, spec.args, { ...options, shell: spec.shell, stdio: "inherit" });
}

