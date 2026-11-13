# apps/api

Express 5 API입니다. 모듈은 `catalog`, `inventory`, `orders`, `auth`, `shared`이고 모듈마다 네 계층을 둡니다.

| 계층 | 하는 일 | import해도 되는 것 |
| --- | --- | --- |
| `web` | 라우트, 요청 검사(contracts의 zod), mapper | 같은 모듈의 application, contracts |
| `application` | 유스케이스(service), 트랜잭션 경계 | 같은 모듈의 domain, 다른 모듈의 application |
| `domain` | 엔터티, 규칙, 상태 전이 함수, repository 인터페이스 | `@grabmarket/shared`만 |
| `infra` | repository 구현(SQL) | 같은 모듈의 domain, `@grabmarket/db` |

## 새 코드를 놓는 법

- controller는 요청 검사 → service 호출 → mapper 호출 → 응답만 한다. repository를 import하지 않는다.
- 조회 메서드 이름은 누구의 것인지 드러낸다: `getForCustomer(customerId, orderId)`, `listForCustomer(customerId)`. 남의 주문이면 `notFound`를 던진다.
- 응답 DTO는 `web/*-mapper.ts`의 `toXxxDto`가 만든다. 응답 모양은 `packages/contracts`의 스키마가 정한다.
- 재고 수량은 `InventoryService`만 바꾼다. 돈은 `@grabmarket/shared`의 `Money`(정수 원)로 계산한다.
- 시간은 생성자로 받은 `Clock`으로 읽는다. 의존성은 `src/composition.ts` 한 곳에서만 만든다.
- 오류는 `DomainError`로 던지고, HTTP 상태와 메시지는 `shared/web/error-handler.ts`가 바꾼다.

규칙의 이유와 예시: `docs/rules/`, 계층 그림: `docs/architecture.md`.
