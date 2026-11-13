import type { OrderItem } from "@grabmarket/contracts";
import { krw } from "../lib/format.ts";

/** 주문 상품 목록(이미지·이름·수량과 개당 가격·줄 합계). 주문서·주문 완료·내 주문 상세·관리자 상세가 같이 쓴다. */
export function OrderLines({ items, size = "md" }: { items: ReadonlyArray<Pick<OrderItem, "productId" | "productName" | "imageUrl" | "unitPrice" | "quantity" | "lineTotal">>; size?: "sm" | "md" }) {
  const image = size === "md" ? "size-16" : "size-14";
  return (
    <ul>
      {items.map((item) => (
        <li key={item.productId} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0 md:px-6">
          <img src={item.imageUrl} alt="" loading="lazy" className={`${image} shrink-0 rounded-sm bg-canvas object-cover`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink md:text-base">{item.productName}</p>
            <p className="mt-0.5 text-xs-plus text-ink-3">
              수량 {item.quantity}개 · 개당 {krw(item.unitPrice)}
            </p>
          </div>
          <p className="shrink-0 text-base font-extrabold text-ink md:text-lg">{krw(item.lineTotal)}</p>
        </li>
      ))}
    </ul>
  );
}
