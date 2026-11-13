-- 0002_restock_movement_kind: 입출고 이력에 주문 취소로 재고가 되돌아온 'restock' 종류를 더한다.
-- SQLite는 CHECK 제약을 고칠 수 없어서 같은 모양의 표를 새로 만들고 행을 옮긴 뒤 바꿔 끼운다.

CREATE TABLE inventory_movements_next (
  id             INTEGER PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products (id),
  -- inbound: 입고, outbound: 주문 출고, restock: 주문 취소로 되돌아온 재고
  kind           TEXT    NOT NULL CHECK (kind IN ('inbound', 'outbound', 'restock')),
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  order_id       INTEGER REFERENCES orders (id),
  memo           TEXT,
  idempotency_key TEXT   UNIQUE,
  created_by     INTEGER REFERENCES users (id),
  created_at     TEXT    NOT NULL
);

INSERT INTO inventory_movements_next
  (id, product_id, kind, quantity_delta, quantity_after, order_id, memo, idempotency_key, created_by, created_at)
SELECT id, product_id, kind, quantity_delta, quantity_after, order_id, memo, idempotency_key, created_by, created_at
  FROM inventory_movements;

DROP TABLE inventory_movements;
ALTER TABLE inventory_movements_next RENAME TO inventory_movements;
CREATE INDEX inventory_movements_product_id ON inventory_movements (product_id, created_at);
