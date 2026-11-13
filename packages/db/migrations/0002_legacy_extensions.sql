-- 0002_legacy_extensions: 주문 취소, 포인트, 쿠폰, 결제 내역, 배송, 반품·교환, 알림, 알림 대기열, 배치 기록, 일 정산
-- 예전 운영 시스템에서 옮겨 온 표들이다. 이름과 자료형은 옮겨 올 때 모양 그대로 두었다.

CREATE TABLE order_cancellations (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL UNIQUE REFERENCES orders (id),
  customer_id     INTEGER NOT NULL REFERENCES users (id),
  reason          TEXT,
  previous_status TEXT    NOT NULL,
  created_at      TEXT    NOT NULL
);

CREATE TABLE point_balances (
  user_id    INTEGER PRIMARY KEY REFERENCES users (id),
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL
);

CREATE TABLE point_ledger (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id),
  -- earn 적립, use 사용, expire 소멸, refund 환불, admin 관리자 조정
  kind          TEXT    NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  order_id      INTEGER REFERENCES orders (id),
  memo          TEXT,
  expires_at    TEXT,
  expired       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);
CREATE INDEX point_ledger_user ON point_ledger (user_id, created_at);
CREATE INDEX point_ledger_expires ON point_ledger (expires_at);

CREATE TABLE coupons (
  id               INTEGER PRIMARY KEY,
  code             TEXT    NOT NULL UNIQUE,
  name             TEXT    NOT NULL,
  discount_amount  INTEGER NOT NULL,
  min_order_amount INTEGER NOT NULL DEFAULT 0,
  starts_at        TEXT    NOT NULL,
  ends_at          TEXT    NOT NULL,
  issue_limit      INTEGER NOT NULL,
  issued_count     INTEGER NOT NULL DEFAULT 0,
  used_count       INTEGER NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES users (id),
  created_at       TEXT    NOT NULL
);

CREATE TABLE coupon_wallet (
  id          INTEGER PRIMARY KEY,
  coupon_id   INTEGER NOT NULL REFERENCES coupons (id),
  user_id     INTEGER NOT NULL REFERENCES users (id),
  received_at TEXT    NOT NULL,
  used_at     TEXT,
  order_id    INTEGER REFERENCES orders (id),
  UNIQUE (coupon_id, user_id)
);

CREATE TABLE coupon_redemptions (
  id          INTEGER PRIMARY KEY,
  coupon_id   INTEGER NOT NULL REFERENCES coupons (id),
  user_id     INTEGER NOT NULL REFERENCES users (id),
  order_id    INTEGER NOT NULL REFERENCES orders (id),
  discount    INTEGER NOT NULL,
  -- used 사용, restored 취소로 되돌림
  state       TEXT    NOT NULL DEFAULT 'used',
  created_at  TEXT    NOT NULL,
  restored_at TEXT
);
CREATE INDEX coupon_redemptions_order ON coupon_redemptions (order_id);

CREATE TABLE order_payments (
  order_id        INTEGER PRIMARY KEY REFERENCES orders (id),
  coupon_id       INTEGER REFERENCES coupons (id),
  coupon_discount INTEGER NOT NULL DEFAULT 0,
  point_used      INTEGER NOT NULL DEFAULT 0,
  paid_amount     INTEGER NOT NULL,
  reward_points   INTEGER NOT NULL DEFAULT 0,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  -- none, partial, full
  refund_status   TEXT    NOT NULL DEFAULT 'none',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE shipments (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL UNIQUE REFERENCES orders (id),
  courier_code  TEXT    NOT NULL,
  tracking_no   TEXT    NOT NULL UNIQUE,
  -- registered, in_transit, delivered
  state         TEXT    NOT NULL,
  registered_by INTEGER REFERENCES users (id),
  registered_at TEXT    NOT NULL,
  delivered_at  TEXT,
  last_synced_at TEXT
);

CREATE TABLE return_requests (
  id            INTEGER PRIMARY KEY,
  request_no    TEXT    NOT NULL UNIQUE,
  order_id      INTEGER NOT NULL REFERENCES orders (id),
  user_id       INTEGER NOT NULL REFERENCES users (id),
  -- return 반품, exchange 교환
  kind          TEXT    NOT NULL,
  reason_code   TEXT    NOT NULL,
  detail        TEXT,
  -- requested, approved, rejected
  state         TEXT    NOT NULL DEFAULT 'requested',
  refund_amount INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  decided_by    INTEGER REFERENCES users (id),
  decided_at    TEXT,
  created_at    TEXT    NOT NULL
);
CREATE INDEX return_requests_state ON return_requests (state, created_at);

CREATE TABLE return_request_items (
  id            INTEGER PRIMARY KEY,
  return_id     INTEGER NOT NULL REFERENCES return_requests (id),
  order_item_id INTEGER NOT NULL REFERENCES order_items (id),
  product_id    INTEGER NOT NULL REFERENCES products (id),
  product_name  TEXT    NOT NULL,
  quantity      INTEGER NOT NULL,
  amount        INTEGER NOT NULL
);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT    NOT NULL
);
CREATE INDEX notifications_user ON notifications (user_id, created_at);

CREATE TABLE notification_queue (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users (id),
  type            TEXT    NOT NULL,
  payload         TEXT    NOT NULL,
  scheduled_at    TEXT    NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  -- pending, sent, failed
  state           TEXT    NOT NULL DEFAULT 'pending',
  last_error      TEXT,
  notification_id INTEGER REFERENCES notifications (id),
  sent_at         TEXT,
  created_at      TEXT    NOT NULL
);
CREATE INDEX notification_queue_state ON notification_queue (state, scheduled_at);

CREATE TABLE batch_runs (
  id          INTEGER PRIMARY KEY,
  job_name    TEXT    NOT NULL,
  run_key     TEXT    NOT NULL,
  started_at  TEXT    NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  processed   INTEGER,
  total       INTEGER,
  -- running, success, failed, skipped
  state       TEXT    NOT NULL,
  note        TEXT,
  trigger     TEXT    NOT NULL DEFAULT 'schedule'
);
CREATE INDEX batch_runs_job ON batch_runs (job_name, started_at);

CREATE TABLE settlement_daily (
  day             TEXT PRIMARY KEY,
  order_count     INTEGER NOT NULL,
  goods_amount    REAL    NOT NULL,
  shipping_amount REAL    NOT NULL,
  coupon_amount   REAL    NOT NULL,
  point_amount    REAL    NOT NULL,
  net_amount      REAL    NOT NULL,
  closed_at       TEXT    NOT NULL,
  closed_by_run   INTEGER REFERENCES batch_runs (id)
);
