// 결정적 시드: 같은 기준일·같은 PRNG 시드면 언제 어디서 돌려도 같은 데이터가 나온다.
// 계정·상품·재고 행은 직접 넣고, 재고 변화와 주문과 상태 전이는 실제 서비스를 같은 규칙으로 거쳐 만든다(재고는 inventory 서비스로만).
import { DEMO_ACCOUNTS } from "@grabmarket/contracts";
import { type Database, dropAllTables, migrate } from "@grabmarket/db";
import { FixedClock } from "@grabmarket/shared";
import { hashPassword } from "../auth/infra/scrypt-password-hasher.ts";
import { InCodeProductStoryRepository } from "../catalog/infra/in-code-product-story-repository.ts";
import { composeServices } from "../composition.ts";
import { nextStatusOf } from "../orders/domain/order-status.ts";
import type { SessionUser } from "../shared/domain/session-user.ts";
import { planCustomers, type SeedCustomer } from "./customers.ts";
import { Prng } from "./prng.ts";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./product-catalog.ts";
import { SeedClock } from "./seed-clock.ts";
import { seedLegacyData } from "../legacy/legacySeed.ts";

/** 고정 기준일: 시드의 "오늘". 주문은 이 날부터 180일 전까지 걸쳐 있다. */
export const SEED_BASE_DATE = new Date("2026-11-14T00:00:00.000Z");
export const SEED_ORDER_COUNT = 5_000;
export const SEED_HISTORY_DAYS = 180;
const PRNG_SEED = 20_261_114;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface SeedProduct {
  id: number;
  popularity: number;
  safetyStock: number;
  finalStock: number;
}

interface PlannedOrder {
  at: Date;
  customer: SessionUser;
  lines: { productId: number; quantity: number }[];
  /** 기준일까지 몇 단계 넘어갔는지(0이면 결제완료 그대로) */
  steps: number;
}

type SeedEvent =
  | { kind: "opening"; at: Date; productId: number; quantity: number }
  | { kind: "restock"; at: Date; productId: number; quantity: number; key: number }
  | { kind: "order"; at: Date; order: PlannedOrder; key: number };

/** 모든 테이블을 지우고 스키마를 다시 만든 뒤 시드를 채운다. 서버가 같은 파일을 열어 두어도 된다. */
export function resetAndSeedDatabase(db: Database): void {
  dropAllTables(db);
  migrate(db, new FixedClock(SEED_BASE_DATE));
  seedDatabase(db);
}

/** 마이그레이션이 끝난 빈 DB에 시드를 채운다. */
export function seedDatabase(db: Database): void {
  const prng = new Prng(PRNG_SEED);
  const clock = new SeedClock(new Date(SEED_BASE_DATE.getTime() - (SEED_HISTORY_DAYS + 1) * DAY_MS));
  const services = composeServices({ db, clock });
  services.uow.run(() => {
    const customers = insertAccounts(db, prng);
    const products = insertProducts(db, prng, clock);
    const orders = featureDemoOrders(planOrders(prng, customers, products), customers);
    const events = planEvents(prng, products, orders);
    for (const event of events) {
      clock.set(event.at);
      if (event.kind === "order") {
        const placed = services.orders.place(event.order.customer, {
          idempotencyKey: `seed-order-${event.key}`,
          items: event.order.lines,
          shipping: shippingOf(event.order.customer),
          paymentMethod: "virtual",
        });
        let status = placed.order.status;
        for (let step = 1; step <= event.order.steps; step++) {
          const next = nextStatusOf(status);
          if (next === null) break;
          clock.set(new Date(Math.min(event.at.getTime() + step * prng.int(4, 30) * HOUR_MS, SEED_BASE_DATE.getTime())));
          status = services.adminOrders.changeStatus(placed.order.id, next).order.status;
        }
      } else {
        services.inventory.registerInbound(adminUser(), event.productId, {
          idempotencyKey: event.kind === "opening" ? `seed-opening-${event.productId}` : `seed-restock-${event.key}`,
          quantity: event.quantity,
          memo: event.kind === "opening" ? "초기 입고" : "정기 입고",
        });
      }
    }
  });
  services.uow.run(() => {
    seedLegacyData(db, services, SEED_BASE_DATE);
  });
}

/** 로그인 고객 2명이 최근 며칠 동안 단계마다 주문을 하나씩 갖도록, 최근 주문 몇 건의 고객과 진행 단계를 정한다. */
const DEMO_RECENT_ORDERS: readonly { customer: 0 | 1; ageDays: number; steps: number }[] = [
  { customer: 0, ageDays: 0.15, steps: 0 },
  { customer: 0, ageDays: 0.6, steps: 0 },
  { customer: 0, ageDays: 1.3, steps: 1 },
  { customer: 0, ageDays: 2.2, steps: 2 },
  { customer: 0, ageDays: 3.1, steps: 3 },
  { customer: 0, ageDays: 4.4, steps: 3 },
  { customer: 0, ageDays: 5.8, steps: 3 },
  { customer: 1, ageDays: 0.3, steps: 0 },
  { customer: 1, ageDays: 1.1, steps: 1 },
  { customer: 1, ageDays: 2.6, steps: 2 },
  { customer: 1, ageDays: 3.6, steps: 3 },
  { customer: 1, ageDays: 5.1, steps: 3 },
];

function featureDemoOrders(orders: PlannedOrder[], customers: SessionUser[]): PlannedOrder[] {
  const taken = new Set<number>();
  for (const target of DEMO_RECENT_ORDERS) {
    const customer = customers[target.customer];
    if (customer === undefined) throw new Error("로그인 고객이 없습니다");
    const wantedMs = SEED_BASE_DATE.getTime() - target.ageDays * DAY_MS;
    let best = -1;
    for (const [index, order] of orders.entries()) {
      if (taken.has(index)) continue;
      const current = orders[best];
      if (best === -1 || (current !== undefined && Math.abs(order.at.getTime() - wantedMs) < Math.abs(current.at.getTime() - wantedMs))) best = index;
    }
    const chosen = orders[best];
    if (chosen === undefined) throw new Error("최근 주문이 없습니다");
    taken.add(best);
    orders[best] = { ...chosen, customer, steps: target.steps };
  }
  return orders;
}

function demoAdmin(): (typeof DEMO_ACCOUNTS)[number] {
  const admin = DEMO_ACCOUNTS.find((account) => account.role === "admin");
  if (admin === undefined) throw new Error("관리자 교육용 계정이 없습니다");
  return admin;
}

/** 시드가 만드는 관리자는 항상 첫 사용자라 id가 1이다. */
function adminUser(): SessionUser {
  const admin = demoAdmin();
  return { id: 1, email: admin.email, name: admin.name, role: "admin", phone: null, address: null };
}

function shippingOf(customer: SessionUser): { recipientName: string; phone: string; address: string } {
  if (customer.phone === null || customer.address === null) throw new Error(`고객 ${customer.email}에 기본 배송지가 없습니다`);
  return { recipientName: customer.name, phone: customer.phone, address: customer.address };
}

/** 관리자 1명(id 1), 로그인 고객 2명, 주문만 가진 고객 200명을 넣는다. */
function insertAccounts(db: Database, prng: Prng): SessionUser[] {
  const createdAt = new Date(SEED_BASE_DATE.getTime() - 200 * DAY_MS).toISOString();
  const insert = db.prepare("INSERT INTO users (email, name, role, password_hash, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  // 데모 계정은 salt를 고정해야 시드를 다시 돌려도 해시가 같다. 실서비스 방식이 아니라 교육용이다.
  const salt = (): Buffer => Buffer.from(Array.from({ length: 16 }, () => prng.int(0, 255)));
  const admin = demoAdmin();
  insert.run(admin.email, admin.name, "admin", hashPassword(admin.password, salt()), null, null, createdAt);
  const customers = planCustomers(prng).map((customer: SeedCustomer): SessionUser => {
    const hash = customer.password === undefined ? null : hashPassword(customer.password, salt());
    const result = insert.run(customer.email, customer.name, "customer", hash, customer.phone, customer.address, createdAt);
    return { id: Number(result.lastInsertRowid), email: customer.email, name: customer.name, role: "customer", phone: customer.phone, address: customer.address };
  });
  return customers;
}

/** 카테고리·상품 120개·재고 행(수량 0, 안전재고)을 넣고, 상품마다 마지막에 남길 재고를 정한다. 수량은 입고 이벤트가 채운다. */
function insertProducts(db: Database, prng: Prng, clock: SeedClock): SeedProduct[] {
  const createdAt = clock.now().toISOString();
  const categoryId = new Map<string, number>();
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const result = db.prepare("INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)").run(category.slug, category.name, index + 1);
    categoryId.set(category.slug, Number(result.lastInsertRowid));
  }
  const insertProduct = db.prepare(
    "INSERT INTO products (category_id, base_key, name, option_label, description, price, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertInventory = db.prepare("INSERT INTO inventory (product_id, quantity, safety_stock, updated_at) VALUES (?, 0, ?, ?)");
  const stories = new InCodeProductStoryRepository();
  const products: SeedProduct[] = [];
  for (const base of SEED_PRODUCTS) {
    const story = stories.findByBaseKey(base.key);
    if (story === undefined) throw new Error(`상품 상세 글이 없습니다: ${base.key}`);
    const basePopularity = 0.3 + prng.next() * 2;
    for (const [variantIndex, [option, price]] of base.variants.entries()) {
      const result = insertProduct.run(categoryId.get(base.category) ?? null, base.key, `${base.name} ${option}`, option, story.tagline, price, `/images/products/${base.key}-${variantIndex + 1}.webp`, createdAt);
      const id = Number(result.lastInsertRowid);
      const safetyStock = prng.pick([10, 20, 30]);
      insertInventory.run(id, safetyStock, createdAt);
      products.push({ id, popularity: basePopularity ** 2 * (variantIndex === 0 ? 3 : variantIndex === 1 ? 2 : 1), safetyStock, finalStock: 0 });
    }
  }
  // 마지막에 남을 재고: 품절 8개, 5개 이하 12개, 안전재고 미만 14개, 나머지는 넉넉하게
  const shuffled = shuffle(prng, products);
  for (const [index, product] of shuffled.entries()) {
    if (index < 8) product.finalStock = 0;
    else if (index < 20) product.finalStock = prng.int(1, 5);
    else if (index < 34) product.finalStock = prng.int(6, product.safetyStock - 1);
    else product.finalStock = product.safetyStock + prng.int(10, 300);
  }
  return products;
}

function shuffle<T>(prng: Prng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = prng.int(0, index);
    const held = copy[index];
    const swapped = copy[other];
    if (held === undefined || swapped === undefined) throw new RangeError("섞을 항목이 없습니다");
    copy[index] = swapped;
    copy[other] = held;
  }
  return copy;
}

/** 주문 5,000건의 계획(시각·고객·품목·진행 단계). 같은 시각에 들어온 주문 묶음이 섞여 있다. */
function planOrders(prng: Prng, customers: SessionUser[], products: SeedProduct[]): PlannedOrder[] {
  const startMs = SEED_BASE_DATE.getTime() - SEED_HISTORY_DAYS * DAY_MS;
  const times = Array.from({ length: SEED_ORDER_COUNT }, () => startMs + Math.floor((prng.next() * SEED_HISTORY_DAYS * DAY_MS) / 1000) * 1000);
  for (let group = 0; group < 120; group++) {
    const shared = times[prng.int(0, SEED_ORDER_COUNT - 1)] ?? startMs;
    for (let follower = prng.int(1, 3); follower > 0; follower--) times[prng.int(0, SEED_ORDER_COUNT - 1)] = shared;
  }
  const [demo1, demo2, ...others] = customers;
  if (demo1 === undefined || demo2 === undefined) throw new Error("로그인 고객이 없습니다");
  const weights = products.map((product) => product.popularity);
  return times
    .toSorted((a, b) => a - b)
    .map((time): PlannedOrder => {
      const roll = prng.next();
      const customer = roll < 0.005 ? demo1 : roll < 0.01 ? demo2 : (others[Math.floor(prng.next() ** 1.5 * others.length)] ?? demo1);
      const lineCount = prng.pick([1, 1, 1, 1, 1, 2, 2, 2, 3, 4]);
      const lines = new Map<number, number>();
      while (lines.size < lineCount) {
        const product = products[prng.weightedIndex(weights)];
        if (product === undefined) throw new Error("상품이 없습니다");
        lines.set(product.id, prng.pick([1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5]));
      }
      const ageDays = (SEED_BASE_DATE.getTime() - time) / DAY_MS;
      const steps = ageDays >= 10 ? 3 : Math.min(3, Math.floor(ageDays / 2 + prng.next() * 1.5));
      return { at: new Date(time), customer, lines: [...lines].map(([productId, quantity]) => ({ productId, quantity })), steps };
    });
}

/** 상품마다 첫 입고(주문이 모두 나가도 마지막 재고가 맞는 수량)와, 재고가 넉넉한 상품의 중간 입고를 시간순으로 엮는다. */
function planEvents(prng: Prng, products: SeedProduct[], orders: PlannedOrder[]): SeedEvent[] {
  const sold = new Map<number, number>();
  for (const order of orders) for (const line of order.lines) sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.quantity);
  const openingAt = new Date(SEED_BASE_DATE.getTime() - (SEED_HISTORY_DAYS + 1) * DAY_MS);
  const events: SeedEvent[] = [];
  let restockKey = 0;
  for (const product of products) {
    let restocked = 0;
    if (product.finalStock >= 60 && prng.next() < 0.5) {
      const quantity = prng.int(40, Math.min(product.finalStock, 120));
      restocked = quantity;
      const at = new Date(SEED_BASE_DATE.getTime() - prng.int(5, 170) * DAY_MS + prng.int(0, 23) * HOUR_MS);
      events.push({ kind: "restock", at, productId: product.id, quantity, key: restockKey++ });
    }
    const opening = product.finalStock + (sold.get(product.id) ?? 0) - restocked;
    if (opening > 0) events.push({ kind: "opening", at: openingAt, productId: product.id, quantity: opening });
  }
  orders.forEach((order, index) => events.push({ kind: "order", at: order.at, order, key: index + 1 }));
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at.getTime() - b.event.at.getTime() || a.index - b.index)
    .map(({ event }) => event);
}
