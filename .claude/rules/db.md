---
paths:
  - "packages/db/**"
---

# DB 규칙

- 스키마 변경은 `packages/db/migrations/`에 다음 번호 파일(`0002_이름.sql`)을 새로 만들어서 합니다.
- 이미 있는 번호 파일은 한 글자도 고치지 않습니다. 각 노트북의 DB는 적용한 파일의 내용을 기억하고, 바뀌면 마이그레이션이 멈춥니다.
- 시각은 ISO-8601 UTC 문자열, 돈은 정수 원으로 저장합니다.
- 마이그레이션을 추가하면 `npm run db:reset`으로 처음부터 적용되는지, `packages/db/src/migrate.test.ts`가 통과하는지 확인합니다.
- `data/*.sqlite` 파일은 git에 올리지 않습니다.
