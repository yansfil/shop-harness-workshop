# 고유 규칙 8개

이 레포에서만 지키는 규칙입니다.
일반적인 TypeScript·React 관례가 아니라 이 쇼핑몰의 돈·재고·주문이 틀어지지 않게 하려고 정한 것입니다.

| # | 규칙 | 한 줄 요약 |
| --- | --- | --- |
| 1 | [재고는 inventory 서비스로만](01-inventory-service-only.md) | 재고 수량은 `InventoryService`만 바꾸고 이력을 남긴다 |
| 2 | [돈은 정수 원 Money](02-money-integer-won.md) | 금액은 `Money`(정수 원)로만 계산한다 |
| 3 | [주문 상태는 도메인 전이 함수로만](03-order-status-transition.md) | `status`는 orders 도메인의 전이 함수만 바꾼다 |
| 4 | [시간은 Clock 주입](04-clock-injection.md) | `new Date()` 대신 주입받은 `Clock`을 쓴다 |
| 5 | [고객 ID는 세션에서만](05-customer-id-from-session.md) | 요청 본문·쿼리·경로의 고객 ID를 믿지 않는다 |
| 6 | [DTO 변환은 web mapper](06-dto-in-web-mapper.md) | 응답 DTO는 web 계층 mapper만 만든다 |
| 7 | [완료 전 verify, 테스트 기대값 고정](07-verify-and-fixed-expectations.md) | 끝내기 전에 `npm run verify`, 기존 테스트 기대값은 고치지 않는다 |
| 8 | [DB 변경은 새 번호 마이그레이션](08-new-numbered-migration.md) | 적용된 마이그레이션은 고치지 않고 다음 번호를 만든다 |

계층과 폴더 구조는 [아키텍처 개요](../architecture.md)에 있습니다.
