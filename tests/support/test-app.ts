import { createTestDatabase, type Database } from "@grabmarket/db";
import { FixedClock } from "@grabmarket/shared";
import type { Express } from "express";
import request from "supertest";
import { composeApp } from "../../apps/api/src/composition.ts";
import { hashPassword } from "../../apps/api/src/auth/infra/scrypt-password-hasher.ts";

export const PASSWORD = "grab1234!";
export const NOW = "2026-11-14T03:00:00.000Z";
export const SHIPPING = { recipientName: "김하늘", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" };

/** 상품 id: 1 감귤 3kg(재고 10), 2 충전기(재고 3), 3 백미(품절), 4 양말(5,000원, 재고 100) */
export const PRODUCT = { tangerine: 1, charger: 2, rice: 3, socks: 4 } as const;
export const ACCOUNT = {
  admin: "admin@grabmarket.test",
  customerA: "customer1@grabmarket.test",
  customerB: "customer2@grabmarket.test",
} as const;

export interface TestApp {
  app: Express;
  db: Database;
  clock: FixedClock;
}

/** 빈 스키마에 계정 3개·카테고리 4개·상품 4개·재고를 넣고 앱을 조립한다. */
export function createTestApp(): TestApp {
  const db = createTestDatabase();
  const clock = new FixedClock(NOW);
  const salt = Buffer.alloc(16, 7);
  const insertUser = db.prepare("INSERT INTO users (id, email, name, role, password_hash, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insertUser.run(1, ACCOUNT.admin, "운영자", "admin", hashPassword("admin1234!", salt), null, null, NOW);
  insertUser.run(2, ACCOUNT.customerA, "김하늘", "customer", hashPassword(PASSWORD, salt), SHIPPING.phone, SHIPPING.address, NOW);
  insertUser.run(3, ACCOUNT.customerB, "이도윤", "customer", hashPassword(PASSWORD, salt), SHIPPING.phone, SHIPPING.address, NOW);
  const categories = [
    [1, "food", "식품"],
    [2, "living", "생활"],
    [3, "electronics", "가전"],
    [4, "fashion", "패션"],
  ] as const;
  for (const [id, slug, name] of categories) {
    db.prepare("INSERT INTO categories (id, slug, name, sort_order) VALUES (?, ?, ?, ?)").run(id, slug, name, id);
  }
  const products = [
    [1, 1, "jeju-tangerine", "제주 감귤 3kg", "3kg", 17_900, 10],
    [2, 3, "usb-c-charger", "USB-C 고속 충전기 35W", "35W", 14_900, 3],
    [3, 1, "white-rice", "백미 4kg", "4kg", 15_900, 0],
    [4, 4, "cotton-socks", "면 양말 3켤레", "3켤레", 5_000, 100],
  ] as const;
  for (const [id, categoryId, baseKey, name, option, price, quantity] of products) {
    db.prepare("INSERT INTO products (id, category_id, base_key, name, option_label, description, price, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id, categoryId, baseKey, name, option, `${name} 설명`, price, `/images/products/${baseKey}.webp`, NOW,
    );
    db.prepare("INSERT INTO inventory (product_id, quantity, safety_stock, updated_at) VALUES (?, ?, ?, ?)").run(id, quantity, 5, NOW);
  }
  return { app: composeApp({ db, clock }), db, clock };
}

/** 로그인한 쿠키를 들고 다니는 요청 도구 */
export async function loginAs(app: Express, email: string, password: string = email === ACCOUNT.admin ? "admin1234!" : PASSWORD) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

export function orderBody(items: { productId: number; quantity: number }[], idempotencyKey: string = crypto.randomUUID()) {
  return { idempotencyKey, items, shipping: SHIPPING, paymentMethod: "virtual" };
}
