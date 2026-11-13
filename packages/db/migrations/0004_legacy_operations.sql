-- 0004_legacy_operations: 예전 운영 기능(정산 조정, 포인트 지급 행사, 쿠폰 중지, 교환 재발송,
-- 알림 수신 설정, 공지 발송, 배치 실행 로그)에 쓰는 표.

CREATE TABLE settlement_adjustments (
  id           INTEGER PRIMARY KEY,
  day          TEXT    NOT NULL,
  amount       INTEGER NOT NULL,
  reason       TEXT    NOT NULL,
  created_by   INTEGER REFERENCES users (id),
  created_at   TEXT    NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX settlement_adjustments_day ON settlement_adjustments (day);

CREATE TABLE point_campaigns (
  id            INTEGER PRIMARY KEY,
  title         TEXT    NOT NULL,
  points        INTEGER NOT NULL,
  -- all 전체 고객, list 이메일 목록
  target        TEXT    NOT NULL,
  member_count  INTEGER NOT NULL DEFAULT 0,
  total_points  INTEGER NOT NULL DEFAULT 0,
  skipped       TEXT,
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL
);

ALTER TABLE coupons ADD COLUMN paused_at TEXT;

CREATE TABLE return_shipments (
  id            INTEGER PRIMARY KEY,
  return_id     INTEGER NOT NULL UNIQUE REFERENCES return_requests (id),
  courier_code  TEXT    NOT NULL,
  tracking_no   TEXT    NOT NULL UNIQUE,
  registered_by INTEGER REFERENCES users (id),
  registered_at TEXT    NOT NULL,
  delivered_at  TEXT
);

CREATE TABLE notification_settings (
  user_id       INTEGER PRIMARY KEY REFERENCES users (id),
  order_updates INTEGER NOT NULL DEFAULT 1,
  coupons       INTEGER NOT NULL DEFAULT 1,
  points        INTEGER NOT NULL DEFAULT 1,
  announcements INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT    NOT NULL
);

CREATE TABLE announcements (
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  link        TEXT,
  sent_count  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users (id),
  created_at  TEXT    NOT NULL
);

CREATE TABLE batch_run_logs (
  id         INTEGER PRIMARY KEY,
  run_id     INTEGER NOT NULL REFERENCES batch_runs (id),
  level      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX batch_run_logs_run ON batch_run_logs (run_id);

CREATE TABLE order_address_changes (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders (id),
  changed_by      INTEGER REFERENCES users (id),
  before_name     TEXT    NOT NULL,
  before_phone    TEXT    NOT NULL,
  before_address  TEXT    NOT NULL,
  after_name      TEXT    NOT NULL,
  after_phone     TEXT    NOT NULL,
  after_address   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL
);
CREATE INDEX order_address_changes_order ON order_address_changes (order_id);

CREATE TABLE batch_job_settings (
  job_name   TEXT PRIMARY KEY,
  paused_at  TEXT,
  paused_by  INTEGER REFERENCES users (id),
  memo       TEXT,
  updated_at TEXT NOT NULL
);
