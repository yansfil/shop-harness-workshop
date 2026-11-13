---
name: add-endpoint
description: 그랩마켓 API에 새 엔드포인트(조회나 변경 요청)를 추가하는 정해진 순서. 새 API, 새 조회, 새 요청 처리, 엔드포인트 추가를 요청받을 때 쓴다.
---

# 엔드포인트 추가

계약에서 시작해서 안쪽(domain)에서 바깥(web) 순서로 만든다. 한 단계가 끝날 때마다 `npm run typecheck`를 돌린다.

1. **계약**: `packages/contracts`에 요청·응답 zod 스키마와 경로(`routes.ts`), 계약 표(`endpoints.ts`)를 더한다. 요청에 고객 ID 필드를 넣지 않는다.
2. **domain**: 필요한 타입과 repository 인터페이스 메서드를 `domain/`에 더한다. 상태 변경이 있으면 전이 함수를 쓴다.
3. **infra**: repository 구현(SQL)을 `infra/`에 더한다. 스키마 변경이 필요하면 새 번호 마이그레이션을 만든다.
4. **application**: service 메서드를 더한다. 시간은 `Clock`, 재고는 `InventoryService`, 돈은 `Money`로 다룬다. 쓰기는 `UnitOfWork`로 감싼다.
5. **web**: mapper(`toXxxDto`)와 controller 라우트를 더한다. controller는 요청 검사 → service → mapper → 응답만 한다. 고객은 `requireCustomer(res)`로 세션에서 꺼낸다.
6. **조립**: 새 클래스가 생겼다면 `composition.ts`에서만 만든다.
7. **테스트**: `tests/`에 통합 테스트를 더한다(정상, 권한 없음 403, 로그인 안 함 401, 잘못된 요청 400).
8. `npm run verify`가 통과하는지 확인하고, 만든 파일과 라우트를 짧게 보고한다.
