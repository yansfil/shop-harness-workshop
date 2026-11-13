// node_modules가 지금 package-lock.json대로 설치돼 있는지를 내용으로 판정한다.
// 파일 시각은 보지 않는다: 압축 해제·git checkout·merge·touch는 내용이 같아도 시각을 바꾸기 때문이다(B7).
// 비교 대상은 npm이 설치 뒤 node_modules/.package-lock.json(숨은 lock)에 남기는 packages 표다.
// 숨은 lock에는 이 컴퓨터에 설치되지 않은 optional 패키지(다른 OS·CPU용 바이너리 등)가 없다.
// 그래서 package-lock.json에 있는데 숨은 lock에 없는 패키지는, 이 컴퓨터(OS·CPU)에 맞는 optional이 아니면 건너뛴다.
// 이 컴퓨터에 맞는 optional이 빠져 있으면(다른 OS·CPU용 압축 파일) 설치 안 됨이다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** 두 lock이 같은 패키지인지 가르는 필드. 링크(워크스페이스)는 resolved가 가리키는 폴더다. */
interface LockedPackage {
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  optional?: boolean;
  os?: string[];
  cpu?: string[];
  libc?: string[];
}

type PackageTable = Record<string, LockedPackage>;

export interface Platform {
  os: string;
  cpu: string;
}

export interface InstallState {
  installed: boolean;
  /** 설치돼 있지 않다고 판정한 이유와 할 일. 설치돼 있으면 빈 문자열. */
  reason: string;
}

export class LockfileError extends Error {}

const OS_NAMES: Record<string, string> = { darwin: "Mac", win32: "Windows", linux: "Linux" };

function describe(platform: Platform): string {
  return `${OS_NAMES[platform.os] ?? platform.os} ${platform.cpu}`;
}

function readPackages(file: string, label: string): PackageTable {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new LockfileError(`${label}을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  const packages = (data as { packages?: unknown } | null)?.packages;
  if (typeof packages !== "object" || packages === null) throw new LockfileError(`${label}에 packages 표가 없습니다.`);
  return packages as PackageTable;
}

/** npm의 os·cpu 목록 규칙: 목록에 "!x"가 있으면 x만 제외하고, 아니면 목록에 든 값만 허용한다. */
function allows(list: string[] | undefined, value: string): boolean {
  if (list === undefined || list.length === 0) return true;
  const blocked = list.filter((item) => item.startsWith("!")).map((item) => item.slice(1));
  if (blocked.length > 0) return !blocked.includes(value);
  return list.includes(value);
}

/** 이 컴퓨터에서 npm이 반드시 설치했어야 하는 optional인지. OS·CPU 조건이 없거나 libc가 지정된 것은 판정하지 않는다. */
function requiredHere(entry: LockedPackage, platform: Platform): boolean {
  if (entry.optional !== true) return true;
  if (entry.libc !== undefined) return false;
  if (entry.os === undefined && entry.cpu === undefined) return false;
  return allows(entry.os, platform.os) && allows(entry.cpu, platform.cpu);
}

/** 숨은 lock에 든 OS·CPU 전용 optional 바이너리로 이 node_modules가 어느 컴퓨터용인지 알아낸다. */
function installedPlatforms(installed: PackageTable, platform: Platform): Platform[] {
  const found = new Map<string, Platform>();
  for (const entry of Object.values(installed)) {
    const [os] = entry.os ?? [];
    const [cpu] = entry.cpu ?? [];
    if (entry.optional !== true || entry.libc !== undefined || os === undefined || cpu === undefined || os.startsWith("!") || cpu.startsWith("!")) continue;
    if (os === platform.os && cpu === platform.cpu) continue;
    found.set(`${os} ${cpu}`, { os, cpu });
  }
  return [...found.values()];
}

function differingField(wanted: LockedPackage, installed: LockedPackage): string | null {
  if (wanted.version !== installed.version) return `버전이 package-lock.json(${wanted.version ?? "?"})과 다릅니다(설치된 것: ${installed.version ?? "?"})`;
  if (wanted.resolved !== installed.resolved) return "resolved(받은 곳)가 package-lock.json과 다릅니다";
  if (wanted.integrity !== installed.integrity) return "integrity(내용 확인값)가 package-lock.json과 다릅니다";
  if ((wanted.link === true) !== (installed.link === true)) return "링크 여부가 package-lock.json과 다릅니다";
  return null;
}

export function currentPlatform(): Platform {
  return { os: process.platform, cpu: process.arch };
}

/**
 * package-lock.json과 node_modules/.package-lock.json의 내용이 맞는지, 숨은 lock이 가리키는 패키지 폴더가 실제로 있는지 본다.
 * package-lock.json을 읽지 못하면 LockfileError. 숨은 lock이 없거나 깨졌으면 "설치 안 됨"이다(npm ci가 새로 만든다).
 */
export function checkInstalledDependencies(repoRoot: string, platform: Platform = currentPlatform()): InstallState {
  const wanted = readPackages(path.join(repoRoot, "package-lock.json"), "package-lock.json");
  const hiddenFile = path.join(repoRoot, "node_modules", ".package-lock.json");
  if (!existsSync(hiddenFile)) return { installed: false, reason: "node_modules/.package-lock.json이 없습니다" };
  let installed: PackageTable;
  try {
    installed = readPackages(hiddenFile, "node_modules/.package-lock.json");
  } catch (error) {
    return { installed: false, reason: error instanceof Error ? error.message : String(error) };
  }

  for (const [location, wantedPackage] of Object.entries(wanted)) {
    if (location === "") continue; // 루트 패키지 자신
    const found = installed[location];
    if (found === undefined) {
      if (!requiredHere(wantedPackage, platform)) continue; // 이 컴퓨터에 맞지 않아 npm이 설치하지 않은 optional 패키지
      if (wantedPackage.optional !== true) return { installed: false, reason: `${location}이 설치돼 있지 않습니다` };
      const others = installedPlatforms(installed, platform);
      const here = describe(platform);
      if (others.length > 0) {
        return {
          installed: false,
          reason: `이 node_modules는 ${others.map(describe).join(", ")}용이에요. 이 컴퓨터는 ${here}이라 ${here}용 압축 파일을 받으세요`,
        };
      }
      return { installed: false, reason: `${here}용 ${location}이 설치돼 있지 않습니다` };
    }
    const difference = differingField(wantedPackage, found);
    if (difference !== null) return { installed: false, reason: `${location}의 ${difference}` };
  }
  for (const location of Object.keys(installed)) {
    if (wanted[location] === undefined) return { installed: false, reason: `${location}은 package-lock.json에 없는 패키지입니다` };
  }
  // 숨은 lock이 멀쩡해도 압축 해제가 일부 폴더를 건너뛰었을 수 있다(Windows 탐색기는 긴 경로를 건너뛴다).
  for (const location of Object.keys(installed)) {
    if (!existsSync(path.join(repoRoot, location, "package.json"))) {
      return {
        installed: false,
        reason: `${location}/package.json이 없습니다. 압축을 풀다 일부 파일을 건너뛴 것 같아요(Windows 탐색기는 긴 경로를 건너뜁니다. 7-Zip으로 C:\\grab 같은 짧은 경로에 다시 푸세요)`,
      };
    }
  }
  return { installed: true, reason: "" };
}
