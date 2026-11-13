---
paths:
  - "apps/api/src/**/domain/**"
---

# 도메인 계층 규칙

- 이 계층은 `@grabmarket/shared`(Money·Clock)와 `shared/domain`(DomainError)만 import합니다. `infra`·`web`·`db`·express를 import하지 않습니다.
- 금액은 `Money` 헬퍼(`won`, `addMoney`, `multiplyMoney`)로만 계산합니다. 소수·`Math.round` 보정을 쓰지 않습니다.
- 시각은 인자로 받습니다. `new Date()`를 부르지 않습니다.
- 주문 상태 전이 규칙은 `order-status.ts`의 전이 함수에만 둡니다.
- 규칙을 어기면 `DomainError`를 던지고, HTTP 상태로 바꾸는 일은 web 계층이 합니다.
