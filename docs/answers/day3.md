# day3 정답표

이 문서는 day3-answers 브랜치에만 있습니다.
day3 시작 브랜치(커밋 95516dd)에 심어 둔 문제와 그 고친 모습을 적었습니다.
위치(파일·줄)는 고치기 전 커밋 95516dd 기준입니다.
계정은 고객1 customer1@grabmarket.test, 고객2 customer2@grabmarket.test(비밀번호 grab1234!), 관리자 admin@grabmarket.test(admin1234!)입니다.

## 심은 문제 요약

| 묶음 | 개수 | 고친 곳 |
| --- | --- | --- |
| 숨은 버그 | 2 | B1, B2 |
| 보안 약점 | 4 | S1, S2, S3, S4 |
| 추가로 심은 것 | 2 | X1, X2 |
| 경계 위반 | 14 | V1 ~ V14 |

모두 22개이고, 모두 고쳤습니다.

## 목록을 보기 전에 스스로 찾은 수

목록을 받기 전에 코드 읽기, `npm run grade -- --all`, 임시 DB의 테스트 앱 호출로 먼저 찾았습니다.

- 찾은 것: 22개 중 21개입니다. B1, B2, S1, S2, S3, S4, X2, 경계 위반 14곳(V1 ~ V14)을 모두 찾았고, 앞의 8개 문제는 증상까지 재현했습니다.
- 못 찾은 것: X1(음수 쿠폰) 1개입니다. 쿠폰 발급 화면에 0원 이하 검사가 없다는 것을 보지 못했습니다. 쿠폰 코드는 읽었지만 발급 입력 검사와 할인 금액 상한을 확인하지 않았습니다.
- 목록 밖에서 더 찾은 것(채점기·코드로 보이는 같은 뿌리의 문제):
  - `new Date()` 직접 호출 10곳(Clock 규칙). 채점기가 "new Date() 사용 위반 10개"로 보여 줍니다.
  - 쿠폰·포인트 결제가 재고 표를 직접 UPDATE하고 이력도 직접 INSERT합니다(규칙 1). X2와 V14가 있는 같은 곳입니다.
  - 쿠폰·포인트 결제가 주문 상태 'paid'를 SQL로 직접 넣고 주문 번호 날짜를 실제 시각으로 만듭니다(규칙 3, 4).
  - 주문을 취소해도 그 주문으로 적립한 포인트는 회수하지 않습니다. 회수 함수 `revokeEarned`는 있지만 아무 데서도 부르지 않습니다. 정해 둔 규칙(주문 취소는 재고·결제 금액·사용 포인트·쿠폰을 되돌림)에 없어서 이번에는 고치지 않았습니다.

## 확인 방법 (공통)

- 고치기 전: 커밋 95516dd에 `tests/day3-planted-problems.test.ts`를 넣고 `npx vitest run --project node tests/day3-planted-problems.test.ts`를 돌리면 13개가 모두 실패합니다.
- 고친 뒤: 같은 명령이 13개 모두 통과하고, `npm run verify`가 통과합니다.
- 경계 위반은 `npm run grade -- --all`의 "계층 import 방향"과 "new Date() 사용"이 0개가 됩니다.
- 표의 "테스트"는 위 파일 안의 describe 이름과 테스트 이름입니다.

## 숨은 버그

### B1. 취소해도 쓴 포인트가 안 돌아옴

- 위치: `apps/api/src/legacy/orderHooks.ts:15`
- 화면 증상: 고객1이 주문서 포인트 칸에 1000을 넣고 결제한 뒤 내 주문 상세에서 주문을 취소합니다. 결제 금액과 쿠폰은 돌아오지만 포인트 화면에는 "사용 -1,000P" 줄만 있고 되돌린 줄이 없으며 잔액이 그대로입니다.
- 원인: 취소 후처리가 `pay.used_point`를 읽는데 결제 표의 열 이름은 `point_used`입니다. 값이 늘 undefined라 환불 조건이 거짓이 됩니다.
- 고친 방법: `pay.point_used`를 읽습니다.
- 테스트: "포인트 결제 주문 취소 › 포인트로 결제한 주문을 취소하면 쓴 포인트가 그대로 돌아온다"

### B2. 정산 반올림 오차

- 위치: `apps/api/src/settlement/domain/settlementCalc.ts:38-40`(일별), `:77-78`(월별), `apps/api/src/settlement/infra/settlementQueries.ts:48-49`(월별 SQL)
- 화면 증상: 관리자 정산에서 월별 2026년 10월은 88,155,092원인데 일별 탭에서 2026-10-01 ~ 2026-10-31을 조회한 합계는 88,155,084원입니다(시드 기준 8원 차이).
- 원인: 일별은 주문의 쿠폰·포인트를 상품 줄 금액 비중으로 나눠 줄마다 반올림해서 더하고, 월별은 SQL이 비중으로 나눈 실수 합계를 한 번만 반올림합니다. 두 방식이 서로 다르고 둘 다 실제 결제 금액과 어긋날 수 있습니다.
- 고친 방법: 주문의 쿠폰 할인과 사용 포인트는 이미 정수 원이라 나누지 않습니다. 일별은 주문 값을 그대로 더하고(`settleOrder`), 월별은 SQL이 정수를 그대로 합합니다(`monthlyOrderSums`). 일별, 월별, 실제 결제 금액이 항상 같습니다. 줄 단위 분할과 반올림 코드는 지웠습니다.
- 테스트: "정산 반올림 › 쿠폰 할인이 있는 3줄 주문의 일별 정산, 월별 정산, 실제 결제 금액이 같다"
- 참고: 시드를 다시 채우면 마감된 날 기록(`settlement_daily`) 중 78줄의 금액이 달라지고 시드 해시도 바뀝니다. 마감 값이 새 계산으로 만들어지기 때문입니다.

## 보안 약점

### S1. 다른 고객의 주문이 보임

- 위치: `apps/api/src/checkout/web/orderExtrasController.ts:42`(로그인만 확인), `:44`(주인 확인 없이 번호로 조회)
- 화면 증상: 고객2가 로그인한 채 주소창에 `/orders/<고객1 주문 번호>`를 넣으면 고객1의 상품, 결제 금액, 받는 분, 배송지가 보이고 취소 버튼까지 나옵니다. 같은 번호의 `GET /api/orders/:id`는 404입니다.
- 원인: `GET /api/order-extras/:orderId`가 `findById`로 주문을 읽고 요청한 사람이 주인인지 보지 않습니다.
- 고친 방법: 고객은 `findForCustomer(세션의 고객 ID, 주문 번호)`로만 읽고, 없으면 404입니다. 관리자는 모든 주문을 볼 수 있습니다.
- 테스트: "남의 주문 조회 › 다른 고객의 주문 상세(order-extras)는 찾을 수 없다고 나온다"

### S2. 정산 API 권한 검사 빠짐

- 위치: `apps/api/src/settlement/web/settlementController.ts:12`(일별), `:21`(월별)
- 화면 증상: 고객1이 로그인한 브라우저 주소창에 `/api/admin/settlements/daily?from=2026-11-10&to=2026-11-12`를 열면 정산 JSON이 그대로 보입니다. 같은 경로의 `daily.csv`는 403입니다.
- 원인: 두 경로가 `mustLogin`만 부르고 `mustAdmin`을 부르지 않습니다. CSV 경로들만 `mustAdmin`입니다.
- 고친 방법: 일별·월별 모두 `mustAdmin`을 부릅니다.
- 테스트: "관리자 정산 API 권한 › 고객은 /api/admin/settlements/daily를 볼 수 없다", "… /monthly를 볼 수 없다"

### S3. 정산 검색어를 SQL에 이어 붙임

- 위치: `apps/api/src/settlement/infra/settlementQueries.ts:21`
- 화면 증상: 관리자 정산 일별 검색칸에 없는 이름을 넣으면 0건인데, `' OR '1'='1`을 넣으면 기간 전체 주문(266건)이 합산됩니다.
- 원인: 검색어를 `'` 안에 문자열로 이어 붙여 WHERE 조건을 만듭니다.
- 고친 방법: 기간과 검색어 모두 `?`로 바인딩하고 값은 따로 넘깁니다(`settlementWhere`가 `{ sql, args }`를 돌려줍니다).
- 테스트: "정산 검색어 › 검색어에 SQL 조각을 넣어도 조건이 늘어나지 않고 글자 그대로 찾는다"

### S4. 적립 포인트를 브라우저가 계산해 보냄

- 위치: `apps/api/src/checkout/application/checkoutService.ts:61`(`body.rewardPoints`를 그대로 사용), 적립은 `:70`, `:145`
- 화면 증상: 개발자 도구에서 `POST /api/checkout` 본문의 `rewardPoints`를 777777로 바꿔 다시 보내면 포인트 화면에 +777,777P가 적립되고 주문 상세에 "적립 포인트 777,777P"가 나옵니다.
- 원인: 서버가 적립액을 정하지 않고 요청 본문 값을 믿습니다.
- 고친 방법: 서버가 실제 결제 금액의 1%(1P 미만 버림)로 정합니다(`calcRewardPoints`, 정수 계산). 요청의 `rewardPoints`는 읽지 않고, 웹도 더는 보내지 않습니다. 주문서의 "적립 예정" 표시는 그대로입니다.
- 테스트: "포인트 적립 › 요청에 적립액을 실어 보내도 서버가 결제 금액의 1%로 정한다"

## 추가로 심은 문제

### X1. 음수·과대 쿠폰

- 위치: `apps/api/src/coupons/domain/couponRules.ts:49-50`(발급 입력 검사에 0원 이하 검사 없음), `:39`(`discountFor`가 부호와 상한을 보지 않음), `apps/api/src/checkout/application/checkoutService.ts:97`(`paid = payable - usePoints`)
- 화면 증상: 관리자가 할인 금액 -5000으로 쿠폰을 발급하고 고객1이 주문서에서 쓰면 "쿠폰 할인 +5,000원"이 되면서 결제 금액이 15,900원에서 20,900원으로 늘어납니다. 할인 50,000원 쿠폰을 같은 주문서에 쓰면 결제 금액이 -34,100원이 됩니다.
- 원인: 발급할 때 할인 금액이 1원 이상인지 보지 않고, 할인을 계산할 때 상품 합계로 자르지 않습니다.
- 고친 방법: 할인 금액은 1원 이상 정수만 발급할 수 있고(`validateNewCoupon`), 할인은 상품 합계를 넘지 않습니다(`discountFor`). 결제 금액은 배송비 아래로 내려가지 않고, 포인트는 결제 금액 안에서만 쓰므로 0 아래가 되지 않습니다.
- 테스트: "쿠폰 할인 금액 › 관리자가 0원 이하 할인 쿠폰을 발급하려 하면 거절한다", "… 주문 금액보다 큰 할인 쿠폰을 써도 결제 금액이 배송비 아래로 내려가지 않는다"

### X2. 재고 동시 차감

- 위치: `apps/api/src/checkout/application/checkoutService.ts:82`(재고 읽기), `:94`(파트너 포인트 확인 1.5초 대기, `apps/api/src/points/application/partnerPointClient.ts:12`), `:128`(트랜잭션 안에서 다시 확인하지 않고 차감)
- 화면 증상: 품절 상품에 1개를 입고한 뒤 고객1, 고객2가 각자 포인트 100P를 써서 1.5초 안에 결제하면 둘 다 주문이 완료됩니다. 그 뒤 관리자 재고 화면은 "재고를 불러오지 못했어요"로 열리지 않고, `GET /api/admin/inventory`에는 quantity -1이 있습니다.
- 원인: 쿠폰·포인트 결제가 재고를 먼저 읽고 1.5초를 기다린 뒤, 트랜잭션 안에서 다시 확인하지 않고 재고 표를 직접 줄입니다.
- 고친 방법: 쿠폰·포인트 결제도 `OrderService.place`를 거칩니다. 가격 계산, 주문 번호(주입한 시계), 재고 확인과 차감을 한 트랜잭션에서 하고, 모자라면 모두 되돌려 409로 거절합니다. 재고 표와 이력을 직접 고치던 SQL, 'paid' 직접 INSERT, 실제 시각으로 만들던 주문 번호가 함께 없어졌습니다. 결제 중 가격이 바뀌면 `PRICE_CHANGED`로 거절합니다.
- 테스트: "쿠폰·포인트 결제 › 재고가 모자라게 된 결제는 거절하고 재고는 0 아래로 내려가지 않는다", "… 주문 번호의 날짜는 주입한 시계를 따른다"

## 경계 위반 14곳

모두 `apps/api/src/` 아래이고 줄은 import 줄입니다.
테스트는 "계층 경계와 시계 › 계층 import 방향 위반이 없다"(채점기의 layer-import가 0개)입니다.

| # | 위치 | 어긋난 방향 | 고친 방법 |
| --- | --- | --- | --- |
| V1 | `settlement/web/settlementController.ts:5` | web에서 infra | 마감된 날 조회를 `settlementService.closedDaysIn`으로 |
| V2 | `settlement/domain/settlementCalc.ts:3` | domain에서 infra | 주문 정산 행 타입을 domain으로 옮김 |
| V3 | `points/web/pointController.ts:6` | web에서 infra | `pointManager`에 `topHolders`, `totalOutstanding`, `sumByKind` 추가 |
| V4 | `points/application/partnerPointClient.ts:2` | application에서 @grabmarket/db | 불필요한 DB 타입 import 삭제 |
| V5 | `coupons/web/couponController.ts:5` | web에서 infra | `couponManager.findCoupon` |
| V6 | `coupons/domain/couponRules.ts:3` | domain에서 web | 쿠폰 안내 문구 파일을 `coupons/domain/couponMessages.ts`로 이동 |
| V7 | `delivery/web/deliveryController.ts:5` | web에서 infra | `deliveryManager.courierList` |
| V8 | `returns/domain/returnPolicy.ts:3` | domain에서 infra | 배송완료 시각과 이미 신청한 수량을 `returnManager`가 읽어 인자로 넘김 |
| V9 | `returns/web/returnController.ts:5` | web에서 infra | `returnManager.countByState` |
| V10 | `returns/application/stockRestore.ts:3` | application에서 다른 모듈의 infra(inventory) | `InventoryService.restoreForOrder`를 부름(재고는 서비스로만) |
| V11 | `notifications/web/notificationController.ts:6` | web에서 infra | `notificationQueue.queueCounts` |
| V12 | `batch/application/jobs.ts:4` | application에서 다른 모듈의 infra(settlement) | `settlementService`의 `countOrdersOnDay`, `findClosedDay` |
| V13 | `checkout/web/orderExtrasController.ts:4` | web에서 다른 모듈의 infra(orders) | 조립 때 넣은 `orderRepository`(domain 인터페이스)로 읽음 |
| V14 | `checkout/application/checkoutService.ts:19` | application에서 다른 모듈의 infra(inventory) | X2와 같은 수정: `OrderService.place` 사용 |

같은 채점기가 보여 주는 `new Date()` 10곳(`batchRunner.ts:52,55,71`, `checkoutService.ts:100`, `legacyUtils.ts:104,108,112,214`, `partnerPointClient.ts:11,14`)도 고쳤습니다.
조립 때 넣은 Clock을 레거시 코드의 `now()`, `nowIso()`, `nowMs()`가 읽습니다.
테스트는 "계층 경계와 시계 › new Date()를 직접 부르는 곳이 없다"입니다.

## 고치지 않은 것

- 레거시 영역의 옛 스타일(any, 큰 파일, 전역 상태)은 그대로입니다. 문제를 고치는 범위만 바로잡았습니다.
- 주문 취소 때 그 주문으로 적립한 포인트를 회수하지 않는 점은 규칙에 없어서 그대로입니다.
- 결제 직전 제휴 포인트 확인의 1.5초 대기는 그대로입니다.
