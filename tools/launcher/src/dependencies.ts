// node_modules가 지금 package-lock.json대로 설치돼 있는지를 내용으로 판정한다.
// 파일 시각은 보지 않는다: 압축 해제·git checkout·merge·touch는 내용이 같아도 시각을 바꾸기 때문이다(B7).
// 비교 대상은 npm이 설치 뒤 node_modules/.package-lock.json(숨은 lock)에 남기는 packages 표다.
// 숨은 lock에는 이 컴퓨터에 설치되지 않은 optional 패키지(다른 OS용 바이너리 등)가 없다.
// 그래서 package-lock.json에 있는데 숨은 lock에 없는 패키지는 optional 표시가 있을 때만 건너뛴다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** 두 lock이 같은 패키지인지 가르는 필드. 링크(워크스페이스)는 resolved가 가리키는 폴더다. */
interface LockedPackage {
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  optional?: boolean;
}

type PackageTable = Record<string, LockedPackage>;

export interface InstallState {
  installed: boolean;
  /** 설치돼 있지 않다고 판정한 이유. 설치돼 있으면 빈 문자열. */
  reason: string;
}

export class LockfileError extends Error {}

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

function sameLocked(wanted: LockedPackage, installed: LockedPackage): boolean {
  return (
    wanted.version === installed.version &&
    wanted.resolved === installed.resolved &&
    wanted.integrity === installed.integrity &&
    (wanted.link === true) === (installed.link === true)
  );
}

/**
 * package-lock.json과 node_modules/.package-lock.json의 내용이 맞는지 본다.
 * package-lock.json을 읽지 못하면 LockfileError. 숨은 lock이 없거나 깨졌으면 "설치 안 됨"이다(npm ci가 새로 만든다).
 */
export function checkInstalledDependencies(repoRoot: string): InstallState {
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
      if (wantedPackage.optional === true) continue; // 이 컴퓨터에 맞지 않아 npm이 설치하지 않은 optional 패키지
      return { installed: false, reason: `${location}이 설치돼 있지 않습니다` };
    }
    if (!sameLocked(wantedPackage, found)) {
      const was = found.version ?? found.resolved ?? "?";
      const now = wantedPackage.version ?? wantedPackage.resolved ?? "?";
      return { installed: false, reason: `${location}의 설치된 버전(${was})이 package-lock.json(${now})과 다릅니다` };
    }
  }
  for (const location of Object.keys(installed)) {
    if (wanted[location] === undefined) return { installed: false, reason: `${location}은 package-lock.json에 없는 패키지입니다` };
  }
  return { installed: true, reason: "" };
}
