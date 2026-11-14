import { buildPath, ProductDetailResponseSchema, ROUTES, ShippingPolicyResponseSchema } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, PRODUCT } from "./support/test-app.ts";

describe("상품 상세 글", () => {
  it("상세는 한 줄 소개와 상품설명·상품정보 글, 옵션마다 사진과 한 줄을 준다", async () => {
    const { app } = createTestApp();
    const { product } = ProductDetailResponseSchema.parse((await request(app).get(buildPath(ROUTES.product, { productId: PRODUCT.tangerine })).expect(200)).body);

    expect(product.story.eyebrow).toBe("제철 과일");
    expect(product.story.headline).toBe("겨울 내내 손이 가는\n제주 감귤 한 상자");
    expect(product.story.points).toHaveLength(3);
    expect(product.story.info.map((row) => row.label)).toEqual(["원산지", "구성", "보관 방법", "알아 두세요"]);
    expect(product.variants.map((variant) => variant.note)).toEqual(["서너 식구가 며칠 나눠 먹는 양"]);
  });
});

describe("배송 규칙 값", () => {
  it("화면이 문구에 쓰는 값은 견적이 실제로 적용하는 배송비와 무료 기준이다", async () => {
    const { app } = createTestApp();
    const policy = ShippingPolicyResponseSchema.parse((await request(app).get(ROUTES.shippingPolicy).expect(200)).body);

    // 상품 4(양말)는 5,000원이다. 기준에 못 미치는 금액과 딱 맞는 금액으로 견적을 받아 값과 맞춰 본다.
    const below = Math.floor((policy.freeThreshold - 1) / 5_000);
    const enough = Math.ceil(policy.freeThreshold / 5_000);
    const quote = async (quantity: number) => (await request(app).post(ROUTES.orderQuote).send({ items: [{ productId: PRODUCT.socks, quantity }] }).expect(200)).body as { subtotal: number; shippingFee: number };

    const short = await quote(below);
    expect(short.subtotal).toBeLessThan(policy.freeThreshold);
    expect(short.shippingFee).toBe(policy.fee);
    const free = await quote(enough);
    expect(free.subtotal).toBeGreaterThanOrEqual(policy.freeThreshold);
    expect(free.shippingFee).toBe(0);
  });
});
