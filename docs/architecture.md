# 아키텍처 개요

그랩마켓은 가상의 교육용 쇼핑몰입니다.
API 서버(Express 5)와 웹(React+Vite)이 한 레포의 npm workspaces로 묶여 있습니다.

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `apps/api` | Express 5 API. `src/main.ts`가 진입점, `src/composition.ts`가 조립 파일 |
| `apps/web` | React+Vite 웹. Tailwind 토큰은 `src/styles.css`, 화면 경로는 `src/router.tsx` |
| `packages/contracts` | API 요청·응답 zod 스키마와 경로 상수(`ROUTES`, `ENDPOINTS`) |
| `packages/db` | node:sqlite 연결, 번호 마이그레이션(`migrations/`), 테스트용 메모리 DB |
| `packages/shared` | `Money`(정수 원), `Clock`(시간 주입) |
| `tools` | 관찰 도구와 DB MCP 서버 |
| `tests` | API 통합 테스트(supertest) |
| `docs/rules` | 이 레포의 고유 규칙 8개 |

## 요청이 지나가는 길

```
브라우저 ──/api──▶ Vite 프록시 ──▶ Express (127.0.0.1)
                                     │
             web(controller·mapper) ─▶ application(service) ─▶ domain
                                                                 ▲
                                               infra(repository) ┘
```

API 모듈은 `catalog`, `inventory`, `orders`, `auth`, `shared`이고, 모듈마다 네 계층을 둡니다.

| 계층 | 하는 일 | import해도 되는 것 |
| --- | --- | --- |
| `web` | 라우트 등록, 요청 검사(contracts의 zod), 도메인 → 응답 DTO 변환(mapper) | 같은 모듈의 application, contracts |
| `application` | 유스케이스(service). 트랜잭션 경계 | 같은 모듈의 domain, 다른 모듈의 application |
| `domain` | 엔터티, 규칙, 상태 전이 함수, repository 인터페이스 | shared(Money·Clock)만 |
| `infra` | repository 구현(SQL) | 같은 모듈의 domain, db |

화살표는 import 방향입니다.
`web`이 `infra`를 직접 부르거나, `domain`이 `infra`·`web`을 부르면 방향을 어긴 것입니다.

## 조립

`apps/api/src/composition.ts` 한 곳에서 repository → service → controller 순서로 만들고 생성자로 넘깁니다.
다른 파일에서는 의존성을 직접 `new` 하지 않습니다.
테스트는 같은 `composeApp`에 메모리 DB(`createTestDatabase()`)와 고정 시계(`FixedClock`)를 넘깁니다.

## 데이터

SQLite 파일은 `data/` 아래에 있고 git에 올리지 않습니다.
스키마는 `packages/db/migrations/NNNN_이름.sql`이 정하고, 서버가 뜰 때 아직 적용하지 않은 번호만 적용합니다.
서버는 loopback(127.0.0.1)에만 바인딩합니다.

## 환경 변수

키 목록과 기본값은 `apps/api/src/config.ts`의 `ENV_REGISTRY` 한 곳에 있고, `.env.example`이 같은 키를 보입니다.

## 시드와 교육용 계정

`npm run db:reset`은 모든 테이블을 지우고 마이그레이션과 시드를 다시 적용합니다.
시드는 고정 기준일(2026-11-14)과 고정 난수로 만들어서 누가 돌려도 같은 데이터가 나옵니다.
끝에 보여 주는 시드 해시가 같으면 같은 데이터입니다.

| 데이터 | 규모 |
| --- | --- |
| 계정 | 관리자 1명, 로그인 고객 2명, 주문만 가진 고객 200명 |
| 상품 | 120개(기본 상품 40개 × 변형), 이미지는 `apps/web/public/images/products/<key>.webp` 40장 |
| 재고 | 일부 품절, 5개 이하, 안전재고 미만 |
| 주문 | 180일에 걸친 약 5,000건, 같은 시각에 들어온 묶음 포함 |

로그인 화면에 적어 두는 교육용 계정입니다.

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 고객 1 | `customer1@grabmarket.test` | `grab1234!` |
| 고객 2 | `customer2@grabmarket.test` | `grab1234!` |
| 관리자 | `admin@grabmarket.test` | `admin1234!` |

`npm run orders:simulate`는 몇 초마다 새 주문을 만들고 Ctrl+C로 멈춥니다.
`npm run mcp:db`는 읽기 전용 DB MCP 서버(stdio)를 띄웁니다. 도구는 테이블 목록, 테이블 구조, SELECT 셋뿐입니다.
