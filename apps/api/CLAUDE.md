# apps/api 지침

Express 5 API 서버입니다. 모듈은 `catalog`, `inventory`, `orders`, `auth`, `shared`입니다.

## 계층

모듈마다 `web → application → domain ← infra` 네 계층을 둡니다.

- `web`: controller(라우트 등록, contracts의 zod로 요청 검사 → service 호출 → mapper → 응답)와 mapper. repository를 직접 부르지 않는다.
- `application`: service(유스케이스, 트랜잭션 경계). 다른 모듈은 그 모듈의 application만 부른다.
- `domain`: 엔터티, 규칙, 상태 전이 함수, repository 인터페이스. `shared`(Money·Clock) 말고 아무것도 import하지 않는다.
- `infra`: repository 구현(SQL).

## 지킬 것

- 의존성은 `src/composition.ts` 한 곳에서만 `new` 하고 생성자로 넘깁니다.
- 재고는 `InventoryService`로만, 돈은 `Money`로만, 주문 상태는 `order-status.ts`의 전이 함수로만, 시간은 `Clock`으로만 다룹니다.
- 고객 ID는 세션(`requireUser`)에서만 얻습니다. 요청 본문·쿼리·경로의 값은 읽지 않습니다.
- 응답 모양은 `packages/contracts`가 정하고, 바꾸면 contracts와 web을 함께 고칩니다.
- 새 기능은 같은 모듈의 네 계층 안에 파일을 나눠 둡니다. controller에 로직을 넣지 않습니다.

## 확인

`npm run verify`, 그리고 `npm run grade`로 계층 import 방향·`new Date()`·요청의 `customerId`·전이 함수 밖 `status` 대입을 봅니다.
API 동작은 `tests/`의 통합 테스트(`createTestApp()`)로 확인합니다.
