# 8. DB 변경은 새 번호 마이그레이션

DB 스키마를 바꾸려면 `packages/db/migrations/`에 다음 번호 파일(예: `0002_add_order_memo.sql`)을 새로 만듭니다.
이미 있는 마이그레이션 파일은 고치지 않습니다.

## 이유

각 노트북의 DB는 이미 적용한 번호를 기억하고, 그다음 번호만 적용합니다.
적용된 파일을 고치면 새로 만든 DB와 기존 DB의 스키마가 서로 달라집니다.
마이그레이션 실행기는 적용된 파일의 내용이 바뀐 것을 발견하면 아무것도 적용하지 않고 멈춥니다.

## 좋은 예

```sql
-- packages/db/migrations/0002_add_order_memo.sql
ALTER TABLE orders ADD COLUMN memo TEXT;
```

## 나쁜 예

```diff
  -- packages/db/migrations/0001_init.sql
  CREATE TABLE orders (
    ...
+   memo TEXT,
```
