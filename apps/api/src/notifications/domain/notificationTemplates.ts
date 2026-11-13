// 알림 문구
import { NOTIFY_TYPES, comma, shortOrderNo, str, won } from "../../legacy/legacyUtils.ts";

/** 대기열 payload로 알림함에 들어갈 제목·내용·링크를 만든다 */
export function render(type: string, payload: any): any {
  const p = payload || {};
  const meta = NOTIFY_TYPES[type] || { title: "알림", icon: "bell" };
  const orderText = p.orderNumber ? "주문 " + shortOrderNo(p.orderNumber) : "";
  const itemText = str(p.itemText);
  const join = (parts: string[]) => parts.filter((x) => x !== "").join(" · ");
  switch (type) {
    case "order_placed":
      return { title: meta.title, body: join([itemText, orderText]), link: p.orderId ? "/my/orders/" + p.orderId : null, icon: meta.icon };
    case "order_cancelled":
      return {
        title: meta.title,
        body: join([itemText, orderText, p.refundAmount != null ? won(p.refundAmount) + " 환불" : ""]),
        link: p.orderId ? "/my/orders/" + p.orderId : null,
        icon: meta.icon,
      };
    case "shipping_started":
      return { title: meta.title, body: join([itemText, orderText]), link: p.orderId ? "/my/orders/" + p.orderId + "/tracking" : null, icon: meta.icon };
    case "delivered":
      return { title: meta.title, body: join([itemText, orderText]), link: p.orderId ? "/my/orders/" + p.orderId : null, icon: meta.icon };
    case "coupon_arrived":
      return { title: meta.title, body: join([str(p.name), comma(p.discountAmount) + "원 할인"]), link: null, icon: meta.icon };
    case "return_received":
    case "exchange_received":
      return { title: meta.title, body: join([itemText, orderText, "승인되면 알려 드려요"]), link: "/my/returns", icon: meta.icon };
    case "return_approved":
      return { title: meta.title, body: join([itemText, orderText, won(p.refundAmount) + " 환불"]), link: "/my/returns", icon: meta.icon };
    case "exchange_approved":
      return { title: meta.title, body: join([itemText, orderText, "새 상품을 보내 드려요"]), link: "/my/returns", icon: meta.icon };
    case "return_rejected":
      return { title: meta.title, body: join([itemText, orderText, str(p.reason)]), link: "/my/returns", icon: meta.icon };
    case "points_expiring":
      return { title: meta.title, body: comma(p.points) + "P가 " + str(p.dateText) + "에 사라져요", link: "/my/points", icon: meta.icon };
    default:
      return { title: meta.title, body: str(p.body), link: p.link || null, icon: meta.icon };
  }
}

/** 관리자 대기열 화면의 '내용' 칸 */
export function queueSummary(type: string, payload: any): string {
  const p = payload || {};
  if (type === "coupon_arrived") return str(p.name) + " · " + comma(p.discountAmount) + "원 할인";
  if (type === "points_expiring") return comma(p.points) + "P 소멸 예정";
  const parts: string[] = [];
  if (p.itemText) parts.push(str(p.itemText));
  if (p.orderNumber) parts.push(shortOrderNo(p.orderNumber));
  return parts.join(" · ");
}

export function iconOf(type: string): string {
  return NOTIFY_TYPES[type] ? NOTIFY_TYPES[type].icon : "bell";
}
