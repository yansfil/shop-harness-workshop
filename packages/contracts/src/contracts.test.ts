import { describe, expect, it } from "vitest";
import { ProductSearchQuerySchema } from "./catalog.ts";
import { ENDPOINTS } from "./endpoints.ts";
import { CreateOrderRequestSchema } from "./orders.ts";
import { buildPath, ROUTES } from "./routes.ts";

describe("routes", () => {
  it("buildPath는 :이름 자리에 값을 넣는다", () => {
    expect(buildPath(ROUTES.adminInventoryInbound, { productId: 7 })).toBe("/api/admin/inventory/7/inbound");
  });

  it("모든 경로가 ENDPOINTS 표에 한 번 이상 나온다", () => {
    const covered = new Set(Object.values(ENDPOINTS).map((endpoint) => endpoint.path));
    expect(Object.values(ROUTES).filter((route) => !covered.has(route))).toEqual([]);
  });
});

describe("ProductSearchQuerySchema", () => {
  it("쿼리 문자열을 숫자·불리언으로 바꾸고 기본값을 채운다", () => {
    expect(ProductSearchQuerySchema.parse({ q: " 감귤 ", minPrice: "10000", excludeSoldOut: "true" })).toEqual({
      q: "감귤",
      minPrice: 10000,
      excludeSoldOut: true,
      sort: "default",
    });
  });

  it("최저 가격이 최고 가격보다 크면 거절한다", () => {
    expect(ProductSearchQuerySchema.safeParse({ minPrice: "5000", maxPrice: "1000" }).success).toBe(false);
  });
});

describe("CreateOrderRequestSchema", () => {
  const valid = {
    idempotencyKey: "4f9d4c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f",
    items: [{ productId: 1, quantity: 2 }],
    shipping: { recipientName: "김하늘", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" },
    paymentMethod: "virtual",
  };

  it("고객 ID 없이 주문을 받는다", () => {
    expect(CreateOrderRequestSchema.parse({ ...valid, customerId: 2 })).not.toHaveProperty("customerId");
  });

  it("같은 상품이 두 줄이면 거절한다", () => {
    const duplicated = { ...valid, items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }] };
    expect(CreateOrderRequestSchema.safeParse(duplicated).success).toBe(false);
  });
});
