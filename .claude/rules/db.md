---
paths:
  - "packages/db/**"
---

# DB 스키마와 마이그레이션을 건드릴 때

- 스키마를 바꾸려면 `packages/db/migrations/`에 다음 번호 파일(`NNNN_이름.sql`)을 새로 만든다.
- 이미 있는 마이그레이션 파일은 고치지 않는다. 각 노트북의 DB가 적용한 번호를 기억하고, 내용이 바뀐 것을 발견하면 실행기가 멈춘다.
- 시드는 고정 기준일과 고정 난수로 결정적이어야 한다. `Math.random()`과 `new Date()`를 쓰지 않는다.
- 새 컬럼이 들어가면 시드, `tests/support/test-app.ts`의 테스트 데이터, `tools/mcp-db`가 보이는 구조를 함께 확인한다.
- 마이그레이션 실행기를 바꾸면 `src/migrate.test.ts`도 함께 갱신한다.
