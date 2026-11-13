# shop-harness-workshop

가상의 교육용 쇼핑몰 "그랩마켓"으로 하는 Claude Code 실습 레포입니다.

## 강의 전 준비

### 1. 필요한 것

| 프로그램 | 확인 명령 | 설치 |
| --- | --- | --- |
| Node 24 | `node --version` → `v24.x` | https://nodejs.org/ko/download |
| git | `git --version` | https://git-scm.com/downloads |
| Claude Code | `claude --version` | https://code.claude.com/docs/ko/setup |

Windows에서 관리자 권한이 없으면 Node 다운로드 페이지에서 Windows 바이너리 .zip(x64)을 받아 `C:\Users\<이름>\node24` 같은 곳에 풀고, "계정의 환경 변수 편집"에서 그 폴더를 사용자 Path 맨 위에 넣은 뒤 터미널을 새로 엽니다.
Windows에서는 npm 대신 Claude Code 공식 설치 명령(PowerShell `irm https://claude.ai/install.ps1 | iex`)을 권합니다.

### 2. 받고 점검하기

```bash
git clone https://github.com/yansfil/shop-harness-workshop.git
cd shop-harness-workshop
node start.mjs --check
```

`--check`는 Node 24 → claude 명령 → 의존성(없으면 `npm ci`) → DB(없으면 만들고 시드) → 실습 설정 폴더·`.env`까지 준비하고 결과를 단계마다 보여 줍니다.
claude는 띄우지 않습니다.
실패하면 멈춘 단계 이름, 이유, 설치 링크가 나옵니다.

### 3. 시작하기

```bash
node start.mjs
```

Mac·Windows 모두 같은 명령입니다.
Claude Code는 실습 전용 설정 폴더 `~/.claude-autoever`(Windows는 `C:\Users\<이름>\.claude-autoever`)로 뜨고, 처음이면 로그인 화면이 나옵니다.
원래 `~/.claude` 설정과 로그인은 바뀌지 않습니다.
이 폴더는 레포 밖에 있어서 브랜치를 바꾸거나 다시 clone해도 실습 로그인이 남습니다.
`node start.mjs --continue`처럼 뒤에 붙인 옵션은 claude에 그대로 넘어갑니다.

### clone이나 npm이 막혔을 때

[Releases](https://github.com/yansfil/shop-harness-workshop/releases)에서 OS에 맞는 압축 파일을 받습니다.

| 파일 | 대상 |
| --- | --- |
| `shop-harness-workshop-<태그>-windows-x64.zip` | Windows (x64) |
| `shop-harness-workshop-<태그>-mac-arm64.zip` | Apple Silicon Mac |

압축 파일에는 git 기록 전체와 그 OS용 `node_modules`가 들어 있습니다.
풀고 그 폴더에서 `node start.mjs`로 바로 시작합니다.
모든 브랜치가 같은 package-lock을 쓰므로 `git switch day1-b`처럼 브랜치를 바꿔도 다시 설치하지 않습니다.
Windows는 경로가 길면 풀다가 실패할 수 있으니 `C:\work`처럼 짧은 곳에 풉니다.
Mac에서 풀린 파일이 "확인되지 않은 개발자"로 막히면 `xattr -dr com.apple.quarantine <푼 폴더>`를 실행합니다.

### 강의 뒤 정리

```bash
node cleanup.mjs
```

지울 것(실습 설정 폴더, 세션 기록 수, 실습 worktree)을 먼저 보여 줍니다.
원하면 실습 기록을 HTML로 레포 안 `exports/`에 내보냅니다.
`y`를 입력해야만 실습 설정 폴더 쪽만 로그아웃하고 실습 worktree와 실습 설정 폴더를 지웁니다.
그냥 엔터나 `N`이면 아무것도 지우지 않습니다.
바뀐 내용이 남은 worktree는 지우지 않고 이름과 이유를 보여 줍니다.
원래 `~/.claude`와 레포는 그대로 둡니다.

주의: Mac은 로그인 정보를 키체인에 둡니다.
실습 설정 폴더의 로그아웃이 원래 계정 로그인에 영향을 주지 않는지는 강의 리허설에서 확인하는 항목입니다.
확인 전에는 원래 계정 로그인이 풀릴 수 있다고 보고, 풀리면 `claude`에서 다시 로그인합니다.

> day3 브랜치에는 실습용으로 보안 약점을 일부러 넣은 코드가 있습니다. 내 컴퓨터(127.0.0.1)에서만 띄우고, 실제 데이터를 넣거나 외부에 배포하지 마세요.
