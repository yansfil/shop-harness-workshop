import { afterEach, describe, expect, it } from "vitest";
import { clearShippingDraft, readShippingDraft, saveShippingDraft } from "./shipping-draft.ts";

const shipping = { recipientName: "김하늘", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" };

afterEach(clearShippingDraft);

describe("이번 주문에서만 고친 배송지", () => {
  it("저장한 사용자가 다시 열면 같은 값을 돌려주고, 다른 사용자에게는 주지 않는다", () => {
    saveShippingDraft(1, { ...shipping, address: "서울특별시 한울구 새벽로 99" });
    expect(readShippingDraft(1)?.address).toBe("서울특별시 한울구 새벽로 99");
    expect(readShippingDraft(2)).toBeNull();
  });

  it("비우면 기본 배송지로 돌아간다", () => {
    saveShippingDraft(1, shipping);
    clearShippingDraft();
    expect(readShippingDraft(1)).toBeNull();
  });
});
