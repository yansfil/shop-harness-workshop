-- 0003_inventory_reserved: 재고 표를 예전 운영 시스템과 같은 모양으로 다시 만들고 예약 수량 열을 더한다.
-- SQLite는 열 제약을 바꿀 수 없어 새 표로 옮긴 뒤 이름을 바꾼다. 재고 표를 가리키는 외래 키는 없다.

CREATE TABLE inventory_v2 (
  product_id   INTEGER PRIMARY KEY REFERENCES products (id),
  quantity     INTEGER NOT NULL,
  reserved     INTEGER NOT NULL DEFAULT 0,
  safety_stock INTEGER NOT NULL CHECK (safety_stock >= 0),
  updated_at   TEXT    NOT NULL
);

INSERT INTO inventory_v2 (product_id, quantity, reserved, safety_stock, updated_at)
SELECT product_id, quantity, 0, safety_stock, updated_at FROM inventory;

DROP TABLE inventory;

ALTER TABLE inventory_v2 RENAME TO inventory;
