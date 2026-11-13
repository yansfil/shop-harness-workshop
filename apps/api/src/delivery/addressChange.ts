// 배송지 변경: 송장이 나가기 전(결제완료·배송준비)에만 받는 분·연락처·주소를 바꾼다
import {
  addDays,
  badRequest,
  conflict,
  emit,
  fmtMdHm,
  formatPhone,
  isAdmin,
  isPhone,
  loadOrderRow,
  log,
  maskPhone,
  notFoundError,
  now,
  nowIso,
  shortOrderNo,
  trim,
  tx,
  ORDER_STATUS_TEXT,
} from "../legacy/legacyUtils.ts";
import * as addressDao from "./infra/addressDao.ts";
import { findByOrder } from "./infra/shipmentDao.ts";

const CHANGEABLE = ["paid", "preparing"];

/** 지금 바꿀 수 있는지와 못 바꾸는 이유 */
export function changeability(order: any): any {
  if (CHANGEABLE.indexOf(order.status) < 0) return { ok: false, reason: ORDER_STATUS_TEXT[order.status] + " 주문은 배송지를 바꿀 수 없어요." };
  if (findByOrder(order.id)) return { ok: false, reason: "송장이 등록돼 배송지를 바꿀 수 없어요." };
  return { ok: true, reason: null };
}

function mustOwnOrder(user: any, orderId: any): any {
  const order = loadOrderRow(orderId);
  if (!order) throw notFoundError("주문을 찾을 수 없습니다.");
  if (!isAdmin(user) && Number(order.customer_id) !== Number(user.id)) throw notFoundError("주문을 찾을 수 없습니다.");
  return order;
}

function validate(body: any): any {
  const name = trim(body.recipientName);
  const phone = trim(body.phone);
  const address = trim(body.address);
  const fieldErrors: any = {};
  if (name.length < 1 || name.length > 20) fieldErrors.recipientName = ["받는 분 이름을 20자 안으로 적어 주세요"];
  if (!isPhone(phone)) fieldErrors.phone = ["010-0000-0000 형식으로 적어 주세요"];
  if (address.length < 5 || address.length > 120) fieldErrors.address = ["주소를 5~120자로 적어 주세요"];
  if (Object.keys(fieldErrors).length > 0) throw badRequest("입력을 확인해 주세요.", { fieldErrors: fieldErrors });
  return { name: name, phone: formatPhone(phone), address: address };
}

/** 배송지 바꾸기 (고객은 내 주문만, 관리자는 아무 주문이나) */
export function changeAddress(user: any, orderId: any, body: any): any {
  const order = mustOwnOrder(user, orderId);
  const check = changeability(order);
  if (!check.ok) throw conflict("ADDRESS_NOT_CHANGEABLE", check.reason);
  const next = validate(body);
  if (next.name === order.recipient_name && next.phone === order.recipient_phone && next.address === order.shipping_address) {
    return { changed: false, shipping: shippingOf(order) };
  }
  const at = nowIso();
  tx(() => {
    addressDao.insertChange({
      order_id: order.id,
      changed_by: user.id,
      before_name: order.recipient_name,
      before_phone: order.recipient_phone,
      before_address: order.shipping_address,
      after_name: next.name,
      after_phone: next.phone,
      after_address: next.address,
      created_at: at,
    });
    addressDao.updateOrderAddress(order.id, next.name, next.phone, next.address, at);
  });
  if (isAdmin(user)) emit("address.changed", { orderId: order.id, at: at });
  log("order_address_changed", { orderId: order.id, by: isAdmin(user) ? "admin" : "customer" });
  return { changed: true, shipping: shippingOf(loadOrderRow(order.id)) };
}

function shippingOf(order: any): any {
  return { recipientName: order.recipient_name, phone: order.recipient_phone, address: order.shipping_address };
}

/** 변경 기록: 고객에게는 연락처를 가린다 */
export function history(user: any, orderId: any): any {
  const order = mustOwnOrder(user, orderId);
  const check = changeability(order);
  const admin = isAdmin(user);
  return {
    orderId: order.id,
    shortOrderNumber: shortOrderNo(order.order_number),
    changeable: check.ok,
    blockedReason: check.reason,
    shipping: shippingOf(order),
    changes: addressDao.changesOf(order.id).map((c: any) => ({
      id: c.id,
      atText: fmtMdHm(c.created_at),
      by: c.changed_by_role === "admin" ? "관리자" : "고객",
      before: { recipientName: c.before_name, phone: admin ? c.before_phone : maskPhone(c.before_phone), address: c.before_address },
      after: { recipientName: c.after_name, phone: admin ? c.after_phone : maskPhone(c.after_phone), address: c.after_address },
    })),
  };
}

/** 관리자: 최근 7일 배송지 변경 */
export function recent(): any {
  return {
    changes: addressDao.recentChanges(addDays(now(), -7).toISOString(), 100).map((c: any) => ({
      orderId: c.order_id,
      shortOrderNumber: shortOrderNo(c.order_number),
      atText: fmtMdHm(c.created_at),
      before: c.before_address,
      after: c.after_address,
    })),
  };
}
