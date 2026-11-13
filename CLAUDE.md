# 그랩마켓 실습 레포

가상의 교육용 쇼핑몰 "그랩마켓"의 주문·재고 앱입니다.

## 명령어

| 명령 | 하는 일 |
| --- | --- |
| `npm ci` | 의존성 설치 |
| `npm run dev` | API(127.0.0.1:3001)와 웹(127.0.0.1:5173) 개발 서버 |
| `npm run verify` | Node 24 확인 → 타입 검사 → lint → 테스트 → 빌드 |
| `npm test` | 테스트만 (vitest) |
| `npm run typecheck` | 타입 검사만 |
| `npm run lint` | lint만 |
| `npm run build` | 웹 빌드만 |
| `npm run db:reset` | DB를 지우고 시드로 다시 채움 |
| `npm run orders:simulate` | 몇 초마다 새 주문을 만듦(Ctrl+C로 멈춤) |
| `npm run mcp:db` | 읽기 전용 DB MCP 서버(stdio) |
| `npm run viewer` | 세션 뷰어 |
| `npm run grade` | 채점기 |

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `apps/api` | Express 5 API 서버 |
| `apps/web` | React+Vite 웹 |
| `packages/contracts` | API 요청·응답 스키마(zod)와 경로 |
| `packages/db` | SQLite 연결과 마이그레이션 |
| `packages/shared` | 여러 곳에서 쓰는 작은 모듈 |
| `tools` | 관찰 도구 |
| `tests` | API 통합 테스트 |
| `docs` | 문서 |
| `data` | 로컬 SQLite 파일(git 제외) |
