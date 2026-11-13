-- 0001_init: 사용자·세션·카테고리·상품·재고·입출고 이력·주문·주문 품목
-- 이미 적용된 마이그레이션은 고치지 않는다. 바꿀 것이 생기면 다음 번호 파일을 새로 만든다.
-- 시각은 ISO-8601 UTC 문자열(예: 2026-11-14T09:00:00.000Z), 돈은 정수 원이다.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('customer', 'admin')),
  -- 주문만 가진 고객은 로그인하지 않으므로 비밀번호가 없다. 형식: scrypt$<salt hex>$<hash hex>
  password_hash TEXT,
  phone         TEXT,
  address       TEXT,
  created_at    TEXT    NOT NULL
);

CREATE TABLE sessions (
  -- 쿠키의 원래 토큰이 아니라 그 SHA-256 해시를 저장한다.
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL
);
CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE products (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories (id),
  -- 같은 기본 상품의 변형(용량·색)은 base_key와 이미지를 같이 쓴다.
  base_key     TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  option_label TEXT,
  description  TEXT    NOT NULL,
  price        INTEGER NOT NULL CHECK (price >= 0),
  image_path   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL
);
CREATE INDEX products_category_id ON products (category_id);

-- 재고 수량은 inventory 서비스만 바꾼다. 바꿀 때마다 inventory_movements에 한 줄을 남긴다.
CREATE TABLE inventory (
  product_id   INTEGER PRIMARY KEY REFERENCES products (id),
  quantity     INTEGER NOT NULL CHECK (quantity >= 0),
  safety_stock INTEGER NOT NULL CHECK (safety_stock >= 0),
  updated_at   TEXT    NOT NULL
);

CREATE TABLE inventory_movements (
  id             INTEGER PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products (id),
  -- inbound: 입고, outbound: 주문 출고
  kind           TEXT    NOT NULL CHECK (kind IN ('inbound', 'outbound')),
  -- 부호 있는 변화량(입고 +, 출고 -)과 변화 뒤 수량
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  order_id       INTEGER REFERENCES orders (id),
  memo           TEXT,
  -- 같은 입고 등록을 다시 보내도 한 번만 반영되게 하는 키(주문 출고는 NULL)
  idempotency_key TEXT   UNIQUE,
  created_by     INTEGER REFERENCES users (id),
  created_at     TEXT    NOT NULL
);
CREATE INDEX inventory_movements_product_id ON inventory_movements (product_id, created_at);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  order_number     TEXT    NOT NULL UNIQUE,
  customer_id      INTEGER NOT NULL REFERENCES users (id),
  -- paid → preparing → shipping → delivered. 전이는 orders 도메인의 전이 함수만 한다.
  status           TEXT    NOT NULL,
  subtotal         INTEGER NOT NULL CHECK (subtotal >= 0),
  shipping_fee     INTEGER NOT NULL CHECK (shipping_fee >= 0),
  total            INTEGER NOT NULL CHECK (total >= 0),
  payment_method   TEXT    NOT NULL,
  recipient_name   TEXT    NOT NULL,
  recipient_phone  TEXT    NOT NULL,
  shipping_address TEXT    NOT NULL,
  -- 같은 고객이 같은 키로 다시 보내면 새 주문을 만들지 않고 처음 주문을 돌려준다.
  idempotency_key  TEXT    NOT NULL,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX orders_customer_id ON orders (customer_id, created_at);
CREATE INDEX orders_created_at ON orders (created_at);

CREATE TABLE order_items (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products (id),
  -- 주문 순간의 이름·단가를 남긴다(상품 정보가 나중에 바뀌어도 주문 내역은 그대로).
  product_name TEXT    NOT NULL,
  unit_price   INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  line_total   INTEGER NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_items_order_id ON order_items (order_id);
