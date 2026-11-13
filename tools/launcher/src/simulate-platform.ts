// 테스트 보조: LAUNCHER_SIMULATE_PLATFORM=<os>-<cpu>(예: win32-x64)일 때 start.mjs·cleanup.mjs 자식 프로세스에서
// 의존성 판정(dependencies.ts)이 보는 process.platform·process.arch만 바꿔 보이게 한다. NODE_OPTIONS="--import <이 파일>"로 로드한다.
// 명령 찾기·셸 실행 같은 다른 코드는 진짜 값을 보므로 Mac에서도 다른 OS 러너의 "설치 판정" 기대값을 확인할 수 있다.
// Windows의 .cmd 실행 같은 셸 차이는 command.test.ts가 플랫폼을 넣어 확인한다.
const spec = process.env.LAUNCHER_SIMULATE_PLATFORM;
if (spec !== undefined && spec !== "") {
  const [os, cpu] = spec.split("-");
  if (os === undefined || cpu === undefined) throw new Error(`LAUNCHER_SIMULATE_PLATFORM은 <os>-<cpu> 꼴이어야 합니다: ${spec}`);
  const real = { platform: process.platform, arch: process.arch };
  const seenByDependencies = (): boolean => (new Error().stack ?? "").includes("dependencies.ts");
  Object.defineProperty(process, "platform", { configurable: true, get: () => (seenByDependencies() ? os : real.platform) });
  Object.defineProperty(process, "arch", { configurable: true, get: () => (seenByDependencies() ? cpu : real.arch) });
}
