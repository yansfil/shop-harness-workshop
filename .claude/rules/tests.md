---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# 테스트를 쓰거나 고칠 때

- 기존 테스트의 `expect(...)` 값을 바꿔서 통과시키지 않는다. 깨진 테스트는 코드를 고친다. 동작을 정말 바꿔야 하면 먼저 사람에게 확인받고 새 동작을 새 테스트로 적는다.
- API 통합 테스트는 `tests/support/test-app.ts`의 `createTestApp()`(메모리 DB와 `FixedClock`)과 `loginAs()`를 쓴다. 실제 DB 파일이나 `new Date()`를 쓰지 않는다.
- 응답은 `packages/contracts`의 스키마로 `parse`해서 확인하고, 상태 코드도 함께 확인한다.
- 고객·관리자·로그인 안 함 세 입장에서 접근 결과를 확인한다(200, 403, 401). 남의 주문은 404다.
- 화면 테스트는 `apps/web/src/test/fake-api.ts`의 가짜 서버(HTTP 경계만 대신한다)와 `renderApp()`을 쓴다.
- 끝내기 전에 `npm run verify`.
