// 예전 운영 데이터 시드: 쿠폰·결제 내역·포인트·배송·반품·알림·배치 기록·일 정산
// 같은 기준일이면 언제 돌려도 같은 데이터가 나온다(지금 시각을 쓰지 않는다).
import {
  CONFIG,
  COURIERS,
  DAY,
  HOUR,
  MINUTE,
  RETURN_REASONS,
  addDays,
  floorWon,
  initLegacy,
  itemSummary,
  makeReturnNo,
  makeTrackingNo,
  randInt,
  randPick,
  seededRandom,
  ymd,
} from "./legacyUtils.ts";
import { render } from "../notifications/domain/notificationTemplates.ts";
import { daily } from "../settlement/settlementService.ts";
import { restoreReturnedStock } from "../returns/application/stockRestore.ts";

const SEED = 20_261_114;

interface SeedCoupon {
  code: string;
  name: string;
  discount: number;
  minOrder: number;
  starts: string;
  ends: string;
  limit: number;
  exhaust?: boolean;
}

const COUPONS: SeedCoupon[] = [
  { code: "MAY1000", name: "5월 감사 쿠폰", discount: 1000, minOrder: 10000, starts: "2026-05-01", ends: "2026-05-31", limit: 300 },
  { code: "JUN2000", name: "6월 장바구니 쿠폰", discount: 2000, minOrder: 20000, starts: "2026-06-01", ends: "2026-06-30", limit: 400 },
  { code: "SUM1000", name: "여름맞이 쿠폰", discount: 1000, minOrder: 10000, starts: "2026-07-01", ends: "2026-08-31", limit: 250, exhaust: true },
  { code: "SEP3000", name: "추석 장보기 쿠폰", discount: 3000, minOrder: 30000, starts: "2026-09-01", ends: "2026-09-30", limit: 500 },
  { code: "OCT3000", name: "10월 감사 쿠폰", discount: 3000, minOrder: 30000, starts: "2026-10-01", ends: "2026-10-31", limit: 500 },
  { code: "WELCOME3", name: "첫 주문 감사 쿠폰", discount: 3000, minOrder: 30000, starts: "2026-05-01", ends: "2026-12-31", limit: 500 },
  { code: "NOV2000", name: "11월 장바구니 쿠폰", discount: 2000, minOrder: 20000, starts: "2026-11-01", ends: "2026-11-30", limit: 1000 },
  { code: "FRESH5000", name: "식품 5,000원 쿠폰", discount: 5000, minOrder: 50000, starts: "2026-11-10", ends: "2026-11-20", limit: 200 },
];

function startIso(day: string): string {
  return day + "T00:00:00.000Z";
}

function endIso(day: string): string {
  return day + "T23:59:59.999Z";
}

export function seedLegacyData(db: any, services: any, baseDate: Date): void {
  initLegacy(db, services);
  const rand = seededRandom(SEED);
  const base = baseDate.getTime();
  const baseIso = baseDate.toISOString();
  const stmt: any = {};
  const prep = (sql: string) => {
    if (!stmt[sql]) stmt[sql] = db.prepare(sql);
    return stmt[sql];
  };

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const users: any[] = db.prepare("SELECT id, email, name, password_hash FROM users WHERE role = 'customer' ORDER BY id").all();
  const demoIds: number[] = users.filter((u: any) => u.password_hash != null).map((u: any) => Number(u.id));

  /* 쿠폰 */
  const couponRows: any[] = [];
  for (const c of COUPONS) {
    const result = prep(
      "INSERT INTO coupons (code, name, discount_amount, min_order_amount, starts_at, ends_at, issue_limit, issued_count, used_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)",
    ).run(c.code, c.name, c.discount, c.minOrder, startIso(c.starts), endIso(c.ends), c.limit, admin.id, new Date(Date.parse(startIso(c.starts)) - 2 * DAY).toISOString());
    couponRows.push({ ...c, id: Number(result.lastInsertRowid), used: 0, startMs: Date.parse(startIso(c.starts)), endMs: Date.parse(endIso(c.ends)) });
  }

  /* 포인트: 예전 시스템에서 옮겨 온 적립분(1년이 지나 기록 기간 안에 소멸한다) */
  const balances: any = {};
  const ledger: any[] = [];
  const events: any[] = [];
  for (const u of users) {
    const isDemo = demoIds.indexOf(Number(u.id)) >= 0;
    if (!isDemo && rand() > 0.3) continue;
    const amount = isDemo ? 300 : randInt(rand, 3, 15) * 100;
    const at = isDemo ? Date.parse("2025-10-28T00:30:00.000Z") : base - randInt(rand, 380, 520) * DAY;
    events.push({ kind: "legacy_earn", at: at, userId: Number(u.id), amount: amount });
  }

  /* 주문: 결제 내역(쿠폰·포인트) */
  const orders: any[] = db.prepare("SELECT id, order_number, customer_id, status, subtotal, shipping_fee, total, created_at, updated_at FROM orders ORDER BY created_at, id").all();
  for (const o of orders) events.push({ kind: "order", at: Date.parse(o.created_at), order: o });
  events.sort((a, b) => a.at - b.at || (a.kind === "order" ? 1 : 0) - (b.kind === "order" ? 1 : 0));

  const earnQueue: any = {};
  const usedCoupon: any = {};
  const wallet: any = {};
  const redemptions: any[] = [];
  const payments: any[] = [];

  const expireDue = (userId: number, untilMs: number) => {
    const list = earnQueue[userId] || [];
    while (list.length > 0 && list[0].expiresAt <= untilMs) {
      const e = list.shift();
      const balance = balances[userId] || 0;
      const take = Math.min(e.amount, balance);
      e.row.expired = 1;
      if (take <= 0) continue;
      balances[userId] = balance - take;
      ledger.push({ user_id: userId, kind: "expire", amount: -take, balance_after: balances[userId], order_id: null, memo: "유효기간 만료", expires_at: null, expired: 0, created_at: new Date(e.expiresAt).toISOString() });
    }
  };
  const earn = (userId: number, amount: number, at: number, orderId: any, memo: any) => {
    if (amount <= 0) return;
    balances[userId] = (balances[userId] || 0) + amount;
    const expiresAt = at + CONFIG.POINT_EXPIRE_DAYS * DAY;
    const row = { user_id: userId, kind: "earn", amount: amount, balance_after: balances[userId], order_id: orderId, memo: memo, expires_at: new Date(expiresAt).toISOString(), expired: 0, created_at: new Date(at).toISOString() };
    ledger.push(row);
    if (!earnQueue[userId]) earnQueue[userId] = [];
    earnQueue[userId].push({ amount: amount, expiresAt: expiresAt, row: row });
  };

  for (const ev of events) {
    if (ev.kind === "legacy_earn") {
      expireDue(ev.userId, ev.at);
      earn(ev.userId, ev.amount, ev.at, null, "이전 시스템 적립");
      continue;
    }
    const o = ev.order;
    const userId = Number(o.customer_id);
    expireDue(userId, ev.at);
    let coupon: any = null;
    if (rand() < 0.16) {
      const usable = couponRows.filter(
        (c: any) => ev.at >= c.startMs && ev.at <= c.endMs && o.subtotal >= c.minOrder && c.used < c.limit && !usedCoupon[c.id + ":" + userId],
      );
      if (usable.length > 0) coupon = randPick(rand, usable);
    }
    const discount = coupon ? coupon.discount : 0;
    const payable = o.total - discount;
    let points = 0;
    const balance = balances[userId] || 0;
    if (balance >= 300 && rand() < 0.3) {
      points = Math.min(balance, payable, randInt(rand, 3, 30) * 100 + randInt(rand, 0, 9) * 10);
    }
    const at = o.created_at;
    if (coupon) {
      coupon.used++;
      usedCoupon[coupon.id + ":" + userId] = true;
      wallet[coupon.id + ":" + userId] = { coupon_id: coupon.id, user_id: userId, received_at: new Date(Math.max(coupon.startMs, ev.at - randInt(rand, 1, 10) * DAY)).toISOString(), used_at: at, order_id: o.id };
      redemptions.push({ coupon_id: coupon.id, user_id: userId, order_id: o.id, discount: discount, state: "used", created_at: at, restored_at: null });
    }
    if (points > 0) {
      balances[userId] = balance - points;
      ledger.push({ user_id: userId, kind: "use", amount: -points, balance_after: balances[userId], order_id: o.id, memo: null, expires_at: null, expired: 0, created_at: at });
    }
    const paid = payable - points;
    const reward = floorWon(paid * CONFIG.POINT_RATE);
    payments.push({ order_id: o.id, coupon_id: coupon ? coupon.id : null, coupon_discount: discount, point_used: points, paid_amount: paid, reward_points: reward, created_at: at });
    earn(userId, reward, ev.at, o.id, null);
  }
  for (const u of users) expireDue(Number(u.id), base);

  /* 쿠폰 지갑: 로그인 고객에게는 지금 쓸 수 있는 쿠폰을 넣어 둔다 */
  for (const c of couponRows) {
    if (c.endMs < base || c.startMs > base) continue;
    for (const userId of demoIds) {
      const key = c.id + ":" + userId;
      if (!wallet[key]) wallet[key] = { coupon_id: c.id, user_id: userId, received_at: new Date(Math.max(c.startMs, base - 4 * DAY) + 10 * HOUR).toISOString(), used_at: null, order_id: null };
    }
  }
  const insWallet = prep("INSERT INTO coupon_wallet (coupon_id, user_id, received_at, used_at, order_id) VALUES (?, ?, ?, ?, ?)");
  const walletCount: any = {};
  for (const key of Object.keys(wallet).sort((a, b) => wallet[a].received_at.localeCompare(wallet[b].received_at) || a.localeCompare(b))) {
    const w = wallet[key];
    insWallet.run(w.coupon_id, w.user_id, w.received_at, w.used_at, w.order_id);
    walletCount[w.coupon_id] = (walletCount[w.coupon_id] || 0) + 1;
  }
  const insRedemption = prep("INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount, state, created_at, restored_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const r of redemptions) insRedemption.run(r.coupon_id, r.user_id, r.order_id, r.discount, r.state, r.created_at, r.restored_at);
  for (const c of couponRows) {
    const limit = c.exhaust ? Math.max(c.used, 1) : c.limit;
    prep("UPDATE coupons SET used_count = ?, issued_count = ?, issue_limit = ? WHERE id = ?").run(c.used, Math.max(walletCount[c.id] || 0, c.used), limit, c.id);
  }

  /* 결제 내역 */
  const insPayment = prep(
    "INSERT INTO order_payments (order_id, coupon_id, coupon_discount, point_used, paid_amount, reward_points, refunded_amount, refund_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'none', ?, ?)",
  );
  for (const p of payments) insPayment.run(p.order_id, p.coupon_id, p.coupon_discount, p.point_used, p.paid_amount, p.reward_points, p.created_at, p.created_at);

  /* 포인트 원장과 잔액 */
  ledger.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const insLedger = prep(
    "INSERT INTO point_ledger (user_id, kind, amount, balance_after, order_id, memo, expires_at, expired, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const l of ledger) insLedger.run(l.user_id, l.kind, l.amount, l.balance_after, l.order_id, l.memo, l.expires_at, l.expired, l.created_at);
  const insBalance = prep("INSERT INTO point_balances (user_id, balance, updated_at) VALUES (?, ?, ?)");
  for (const u of users) insBalance.run(Number(u.id), balances[Number(u.id)] || 0, baseIso);

  /* 배송: 배송중·배송완료 주문의 송장 */
  const shipped: any[] = db.prepare("SELECT id, order_number, customer_id, status, created_at, updated_at FROM orders WHERE status IN ('shipping', 'delivered') ORDER BY updated_at, id").all();
  const seq: any = {};
  const insShipment = prep(
    "INSERT INTO shipments (order_id, courier_code, tracking_no, state, registered_by, registered_at, delivered_at, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const deliveredAtOf: any = {};
  for (const o of shipped) {
    const courier = randPick(rand, COURIERS).code;
    seq[courier] = (seq[courier] || 552100870000) + randInt(rand, 1, 7);
    const updated = Date.parse(o.updated_at);
    const created = Date.parse(o.created_at);
    if (o.status === "shipping") {
      insShipment.run(o.id, courier, makeTrackingNo(courier, seq[courier]), "in_transit", admin.id, o.updated_at, null, o.updated_at);
    } else {
      const registered = Math.max(created + 30 * MINUTE, updated - 8 * HOUR);
      insShipment.run(o.id, courier, makeTrackingNo(courier, seq[courier]), "delivered", admin.id, new Date(registered).toISOString(), o.updated_at, o.updated_at);
      deliveredAtOf[o.id] = updated;
    }
  }

  /* 반품·교환: 승인 대기 3, 승인됨 12, 거절됨 2 */
  const recentDelivered = shipped.filter((o: any) => o.status === "delivered" && Date.parse(o.updated_at) >= base - 6 * DAY);
  const pickReturnOrders: any[] = [];
  const demoDelivered = recentDelivered.filter((o: any) => demoIds.indexOf(Number(o.customer_id)) >= 0);
  const others = recentDelivered.filter((o: any) => demoIds.indexOf(Number(o.customer_id)) < 0);
  if (demoDelivered.length > 0) pickReturnOrders.push(demoDelivered[demoDelivered.length - 1]);
  while (pickReturnOrders.length < 17 && others.length > 0) pickReturnOrders.push(others.splice(randInt(rand, 0, others.length - 1), 1)[0]);
  pickReturnOrders.sort((a: any, b: any) => a.updated_at.localeCompare(b.updated_at) || a.id - b.id);
  const states = ["approved", "approved", "rejected", "approved", "approved", "approved", "approved", "rejected", "approved", "approved", "approved", "approved", "approved", "approved", "requested", "requested", "requested"];
  const insReturn = prep(
    "INSERT INTO return_requests (request_no, order_id, user_id, kind, reason_code, detail, state, refund_amount, reject_reason, decided_by, decided_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insReturnItem = prep("INSERT INTO return_request_items (return_id, order_item_id, product_id, product_name, quantity, amount) VALUES (?, ?, ?, ?, ?, ?)");
  const returnEvents: any[] = [];
  pickReturnOrders.forEach((o: any, index: number) => {
    const items: any[] = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(o.id);
    const item = items[0];
    const isDemo = demoIds.indexOf(Number(o.customer_id)) >= 0;
    const state = isDemo ? "requested" : states[index] || "approved";
    const kind = !isDemo && index % 6 === 5 ? "exchange" : "return";
    const reason = isDemo ? RETURN_REASONS[0] : randPick(rand, RETURN_REASONS);
    const requestedAt = Math.min(Date.parse(o.updated_at) + randInt(rand, 2, 40) * HOUR, base - randInt(rand, 1, 12) * HOUR);
    const amount = kind === "return" ? item.unit_price * 1 : 0;
    const decidedAt = state === "requested" ? null : new Date(Math.min(requestedAt + randInt(rand, 2, 20) * HOUR, base - 10 * MINUTE)).toISOString();
    const result = insReturn.run(
      makeReturnNo(396 + index),
      o.id,
      o.customer_id,
      kind,
      reason.code,
      isDemo ? "포장이 뜯어진 채로 왔어요" : null,
      state,
      amount,
      state === "rejected" ? "사진으로 손상을 확인하지 못했어요" : null,
      state === "requested" ? null : admin.id,
      decidedAt,
      new Date(requestedAt).toISOString(),
    );
    const returnId = Number(result.lastInsertRowid);
    insReturnItem.run(returnId, item.id, item.product_id, item.product_name, 1, item.unit_price);
    if (state === "approved" && kind === "return") {
      restoreReturnedStock(o.id, [{ product_id: item.product_id, quantity: 1 }], "반품 " + makeReturnNo(396 + index), decidedAt as string);
      prep("UPDATE order_payments SET refunded_amount = refunded_amount + ?, refund_status = 'partial', updated_at = ? WHERE order_id = ?").run(amount, decidedAt, o.id);
    }
    returnEvents.push({ orderId: o.id, userId: Number(o.customer_id), kind: kind, state: state, at: requestedAt, decidedAt: decidedAt, amount: amount, itemText: item.product_name, orderNumber: o.order_number });
  });

  /* 알림과 알림 대기열: 최근 30일 */
  const insNotification = prep("INSERT INTO notifications (user_id, type, title, body, link, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insQueue = prep(
    "INSERT INTO notification_queue (user_id, type, payload, scheduled_at, attempts, state, last_error, notification_id, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const itemsText: any = {};
  for (const row of db.prepare("SELECT order_id, product_name FROM order_items ORDER BY order_id, id").all()) {
    if (!itemsText[row.order_id]) itemsText[row.order_id] = [];
    itemsText[row.order_id].push(row);
  }
  const notices: any[] = [];
  const since = base - 30 * DAY;
  for (const o of orders) {
    const created = Date.parse(o.created_at);
    if (created < since) continue;
    const payload = { orderId: o.id, orderNumber: o.order_number, itemText: itemSummary(itemsText[o.id] || []) };
    notices.push({ userId: Number(o.customer_id), type: "order_placed", payload: payload, at: created + 2 * MINUTE });
  }
  const shipments: any[] = db.prepare("SELECT s.*, o.customer_id, o.order_number FROM shipments s JOIN orders o ON o.id = s.order_id").all();
  for (const s of shipments) {
    const payload = { orderId: s.order_id, orderNumber: s.order_number, itemText: itemSummary(itemsText[s.order_id] || []) };
    const reg = Date.parse(s.registered_at);
    if (reg >= since) notices.push({ userId: Number(s.customer_id), type: "shipping_started", payload: payload, at: reg + 3 * MINUTE });
    if (s.delivered_at && Date.parse(s.delivered_at) >= since) notices.push({ userId: Number(s.customer_id), type: "delivered", payload: payload, at: Date.parse(s.delivered_at) + 3 * MINUTE });
  }
  for (const r of returnEvents) {
    const payload = { orderId: r.orderId, orderNumber: r.orderNumber, itemText: r.itemText, refundAmount: r.amount, reason: "사진으로 손상을 확인하지 못했어요" };
    notices.push({ userId: r.userId, type: r.kind === "exchange" ? "exchange_received" : "return_received", payload: payload, at: r.at + 2 * MINUTE });
    if (r.decidedAt) {
      const type = r.state === "rejected" ? "return_rejected" : r.kind === "exchange" ? "exchange_approved" : "return_approved";
      notices.push({ userId: r.userId, type: type, payload: payload, at: Date.parse(r.decidedAt) + 2 * MINUTE });
    }
  }
  for (const c of couponRows) {
    if (c.startMs < since || c.startMs > base) continue;
    for (const userId of demoIds) notices.push({ userId: userId, type: "coupon_arrived", payload: { couponId: c.id, name: c.name, discountAmount: c.discount }, at: Math.max(c.startMs, base - 4 * DAY) + 10 * HOUR });
  }
  notices.sort((a, b) => a.at - b.at || a.userId - b.userId || a.type.localeCompare(b.type));

  const latestPerDemo: any = {};
  notices.forEach((n, index) => {
    if (demoIds.indexOf(n.userId) >= 0) {
      if (!latestPerDemo[n.userId]) latestPerDemo[n.userId] = [];
      latestPerDemo[n.userId].push(index);
    }
  });
  const unread: any = {};
  for (const userId of Object.keys(latestPerDemo)) {
    const list = latestPerDemo[userId];
    const shipping = list.filter((i: number) => notices[i].type === "shipping_started").slice(-1);
    const couponNotice = list.filter((i: number) => notices[i].type === "coupon_arrived").slice(-1);
    for (const i of shipping.concat(couponNotice)) unread[i] = true;
  }

  let failedPlanted = 0;
  notices.forEach((n, index) => {
    const at = new Date(Math.min(n.at, base - MINUTE)).toISOString();
    const text = render(n.type, n.payload);
    const isFailed = failedPlanted < 2 && index % 97 === 13 && demoIds.indexOf(n.userId) < 0 && n.at > base - 2 * DAY;
    if (isFailed) {
      failedPlanted++;
      insQueue.run(n.userId, n.type, JSON.stringify(n.payload), at, 3, "failed", "알림 서버가 응답하지 않았어요", null, null, at);
      return;
    }
    const readAt = unread[index] || demoIds.indexOf(n.userId) < 0 ? null : new Date(Math.min(n.at + 2 * HOUR, base - MINUTE)).toISOString();
    const result = insNotification.run(n.userId, n.type, text.title, text.body, text.link, readAt, at);
    insQueue.run(n.userId, n.type, JSON.stringify(n.payload), at, 1, "sent", null, Number(result.lastInsertRowid), at, at);
  });
  /* 기준일 밤에 보낼 예정인 알림 */
  const lateOrders = orders.filter((o: any) => Date.parse(o.created_at) >= base - 6 * HOUR).slice(-4);
  lateOrders.forEach((o: any, index: number) => {
    const payload = { orderId: o.id, orderNumber: o.order_number, itemText: itemSummary(itemsText[o.id] || []) };
    const at = new Date(base - 2 * HOUR + index * 5 * MINUTE).toISOString();
    insQueue.run(o.customer_id, index % 2 === 0 ? "order_placed" : "delivered", JSON.stringify(payload), new Date(base + (index + 1) * 10 * MINUTE).toISOString(), 0, "pending", null, null, null, at);
  });

  /* 일 정산 마감과 배치 기록 */
  const firstDay = ymd(orders[0].created_at);
  const lastClosed = ymd(base - DAY);
  const closedRows: any[] = [];
  let chunkFrom = firstDay;
  while (chunkFrom <= lastClosed) {
    const chunkTo = ymd(Math.min(addDays(chunkFrom, 59).getTime(), Date.parse(startIso(lastClosed))));
    const report = daily(chunkFrom, chunkTo, "");
    for (const r of report.rows) closedRows.push(r);
    chunkFrom = ymd(addDays(chunkTo, 1));
  }
  closedRows.sort((a, b) => a.day.localeCompare(b.day));
  const insRun = prep(
    "INSERT INTO batch_runs (job_name, run_key, started_at, finished_at, duration_ms, processed, total, state, note, trigger) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'schedule')",
  );
  const insClosed = prep(
    "INSERT INTO settlement_daily (day, order_count, goods_amount, shipping_amount, coupon_amount, point_amount, net_amount, closed_at, closed_by_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const expiredByDay: any = {};
  for (const l of ledger) if (l.kind === "expire") expiredByDay[l.created_at.slice(0, 10)] = (expiredByDay[l.created_at.slice(0, 10)] || 0) + 1;
  const failDay = ymd(base - 2 * DAY);
  for (const r of closedRows) {
    const runDay = Date.parse(startIso(r.day)) + DAY;
    const closeStart = runDay + 10 * MINUTE;
    const duration = 3000 + randInt(rand, 0, 2200);
    let runId: number;
    if (ymd(runDay) === failDay) {
      insRun.run("settlement_close", r.day, new Date(closeStart).toISOString(), new Date(closeStart + 12000).toISOString(), 12000, 0, r.orderCount, "failed", "데이터베이스가 잠겨 있었어요");
      const expireStart = runDay + 30 * MINUTE;
      insRun.run("point_expire", ymd(runDay), new Date(expireStart).toISOString(), new Date(expireStart).toISOString(), null, null, null, "skipped", "앞 배치가 실패해 실행하지 않았어요");
      const retryStart = runDay + 9 * HOUR + 40 * MINUTE;
      const result = insRun.run("settlement_close", r.day, new Date(retryStart).toISOString(), new Date(retryStart + duration).toISOString(), duration, r.orderCount, r.orderCount, "success", "00:10 실패분을 다시 실행했어요");
      runId = Number(result.lastInsertRowid);
    } else {
      const result = insRun.run("settlement_close", r.day, new Date(closeStart).toISOString(), new Date(closeStart + duration).toISOString(), duration, r.orderCount, r.orderCount, "success", null);
      runId = Number(result.lastInsertRowid);
      const expireStart = runDay + 30 * MINUTE;
      const expired = expiredByDay[ymd(runDay)] || 0;
      const expireDuration = 700 + randInt(rand, 0, 600);
      insRun.run("point_expire", ymd(runDay), new Date(expireStart).toISOString(), new Date(expireStart + expireDuration).toISOString(), expireDuration, expired, expired, "success", null);
    }
    insClosed.run(r.day, r.orderCount, r.goodsAmount, r.shippingAmount, r.couponDiscount, r.pointUsed, r.netAmount, new Date(closeStart + duration).toISOString(), runId);
  }

  /* 교환 재발송: 승인된 교환 중 가장 최근 한 건만 아직 보내지 않았다 */
  const exchanges: any[] = db.prepare("SELECT id, decided_at FROM return_requests WHERE kind = 'exchange' AND state = 'approved' ORDER BY decided_at, id").all();
  const insReship = prep("INSERT INTO return_shipments (return_id, courier_code, tracking_no, registered_by, registered_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?)");
  exchanges.slice(0, Math.max(exchanges.length - 1, 0)).forEach((x: any) => {
    const courier = randPick(rand, COURIERS).code;
    seq[courier] = (seq[courier] || 552100870000) + randInt(rand, 1, 7);
    const registered = Math.min(Date.parse(x.decided_at) + 3 * HOUR, base - 2 * HOUR);
    const delivered = registered + DAY <= base ? new Date(registered + DAY).toISOString() : null;
    insReship.run(x.id, courier, makeTrackingNo(courier, seq[courier]), admin.id, new Date(registered).toISOString(), delivered);
  });

  /* 정산 조정: 지난 마감일 두 건 */
  const insAdjust = prep("INSERT INTO settlement_adjustments (day, amount, reason, created_by, created_at, cancelled_at) VALUES (?, ?, ?, ?, ?, NULL)");
  if (closedRows.length > 8) {
    const a = closedRows[closedRows.length - 6];
    const b = closedRows[closedRows.length - 3];
    insAdjust.run(a.day, -15000, "택배 파손 보상", admin.id, new Date(Date.parse(startIso(a.day)) + DAY + 11 * HOUR).toISOString());
    insAdjust.run(b.day, 4200, "가상 결제 수수료 환급", admin.id, new Date(Date.parse(startIso(b.day)) + DAY + 15 * HOUR).toISOString());
  }

  /* 알림 수신 설정: 일부 고객은 쿠폰·공지 알림을 껐다 */
  const insSettings = prep("INSERT INTO notification_settings (user_id, order_updates, coupons, points, announcements, updated_at) VALUES (?, 1, ?, 1, ?, ?)");
  for (const u of users) {
    if (demoIds.indexOf(Number(u.id)) >= 0 || rand() > 0.08) continue;
    insSettings.run(Number(u.id), rand() < 0.5 ? 0 : 1, 0, new Date(base - randInt(rand, 5, 200) * DAY).toISOString());
  }
}
