// 배송: 송장 등록, 배송 현황, 배송 추적, 배송 완료 동기화
import {
  badRequest,
  conflict,
  courierName,
  customerLabel,
  emit,
  fmtMdHm,
  getServices,
  itemSummary,
  loadOrderItems,
  loadOrderRow,
  log,
  logError,
  makeTrackingNo,
  notFoundError,
  now,
  nowIso,
  relativeDayText,
  shortOrderNo,
  toItemDto,
  trim,
  tx,
  upper,
  ORDER_STATUS_TEXT,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/shipmentDao.ts";
import { checkTrackingNo, couriers, registerParcel, track } from "./infra/fakeCourierApi.ts";
import { currentStep, expectedArrival } from "./domain/trackingSteps.ts";

export const SHIPMENT_STATES: any = {
  REGISTERED: "registered",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
};

const BOARD_TABS = ["preparing", "shipping", "delivered"];

/** 관리자 배송 화면 */
export function board(tabInput: any): any {
  const tab = BOARD_TABS.indexOf(tabInput) >= 0 ? tabInput : "preparing";
  const rows = dao.boardRows(tab, tab === "preparing" ? 1000 : 300);
  return {
    tab: tab,
    counts: dao.statusCounts(),
    couriers: couriers(),
    suggestedTrackingNo: suggestTrackingNo("SB"),
    rows: rows.map((r: any) => ({
      orderId: r.order_id,
      orderNumber: r.order_number,
      shortOrderNumber: shortOrderNo(r.order_number),
      customer: customerLabel({ email: r.customer_email, name: r.customer_name }),
      itemSummary: r.item_count > 1 ? r.first_item + " 외 " + (r.item_count - 1) + "건" : r.first_item,
      orderedAt: r.created_at,
      orderedAtText: fmtMdHm(r.created_at),
      status: r.status,
      statusText: ORDER_STATUS_TEXT[r.status],
      shipment: r.shipment_id
        ? {
            courierCode: r.courier_code,
            courierName: courierName(r.courier_code),
            trackingNo: r.tracking_no,
            registeredAt: r.registered_at,
            registeredAtText: fmtMdHm(r.registered_at),
            deliveredAt: r.delivered_at,
            deliveredAtText: fmtMdHm(r.delivered_at),
          }
        : null,
    })),
  };
}

/** 다음 송장 번호 제안 */
export function suggestTrackingNo(courierCode: string): string {
  const last = dao.lastTrackingSeq(courierCode);
  const base = last > 0 ? last + 1 : 552100874400;
  return makeTrackingNo(courierCode, base);
}

/** 송장 등록: 배송준비 주문만. 등록하면 주문이 배송중으로 넘어가고 고객에게 알림이 간다 */
export function register(admin: any, orderIdInput: any, courierCodeInput: any, trackingNoInput: any): any {
  const orderId = Number(orderIdInput);
  const courierCode = trim(courierCodeInput);
  const trackingNo = upper(trackingNoInput);
  const order = loadOrderRow(orderId);
  if (!order) throw notFoundError("주문을 찾을 수 없습니다.");
  const problem = checkTrackingNo(courierCode, trackingNo);
  if (problem) throw badRequest(problem, { fieldErrors: { trackingNo: [problem] } });
  const existing = dao.findByOrder(orderId);
  if (existing) {
    if (existing.tracking_no === trackingNo) return { orderId: orderId, trackingNo: trackingNo, created: false };
    throw conflict("SHIPMENT_EXISTS", "이미 송장이 등록된 주문이에요.");
  }
  if (order.status !== "preparing") {
    throw conflict("ORDER_NOT_PREPARING", "배송준비 상태인 주문만 송장을 등록할 수 있어요. 지금은 " + ORDER_STATUS_TEXT[order.status] + "이에요.");
  }
  if (dao.findByTrackingNo(trackingNo)) throw conflict("TRACKING_NO_USED", "이미 쓴 송장 번호예요.");
  const at = nowIso();
  const result = tx(() => {
    registerParcel(courierCode, trackingNo, order.order_number);
    const id = dao.insertShipment({
      order_id: orderId,
      courier_code: courierCode,
      tracking_no: trackingNo,
      registered_by: admin ? admin.id : null,
      registered_at: at,
      delivered_at: null,
      last_synced_at: at,
    });
    getServices().adminOrders.changeStatus(orderId, "shipping");
    return { id: id };
  });
  emit("shipment.registered", { orderId: orderId, trackingNo: trackingNo, at: at });
  log("shipment_registered", { orderId: orderId, shipmentId: result.id });
  return { orderId: orderId, trackingNo: trackingNo, created: true, shipmentId: result.id };
}

/** 고객 배송 추적: 내 주문만 */
export function trackingFor(user: any, orderId: any): any {
  const order = loadOrderRow(orderId);
  if (!order || Number(order.customer_id) !== Number(user.id)) throw notFoundError("주문을 찾을 수 없습니다.");
  const items = loadOrderItems(order.id);
  const shipment = dao.findByOrder(order.id);
  const base = {
    order: {
      id: order.id,
      orderNumber: order.order_number,
      shortOrderNumber: shortOrderNo(order.order_number),
      status: order.status,
      statusText: ORDER_STATUS_TEXT[order.status],
      items: items.map(toItemDto),
      itemSummary: itemSummary(items),
      address: order.shipping_address,
      recipientName: order.recipient_name,
    },
  };
  if (!shipment) {
    return {
      ...base,
      shipment: null,
      message: order.status === "cancelled" ? "취소된 주문이에요." : "아직 송장이 등록되지 않았어요. 배송이 시작되면 알려 드려요.",
    };
  }
  const info = track(shipment, now());
  const events = info.events.slice().reverse();
  const current = currentStep(info.events);
  const arrival = shipment.delivered_at ? shipment.delivered_at : expectedArrival(shipment.registered_at).toISOString();
  return {
    ...base,
    shipment: {
      courierCode: shipment.courier_code,
      courierName: info.courierName,
      trackingNo: shipment.tracking_no,
      registeredAt: shipment.registered_at,
      deliveredAt: shipment.delivered_at,
      currentStep: current ? current.key : null,
      arrivalText: shipment.delivered_at ? fmtMdHm(shipment.delivered_at) + " 도착" : relativeDayText(arrival) + " 도착 예정",
      events: events,
    },
    message: null,
  };
}

/**
 * 배송 완료 동기화: 택배사 기준으로 배송이 끝난 송장을 찾아 주문을 배송완료로 넘긴다.
 * 배치가 10분마다 부른다.
 */
export function syncDelivered(atIso?: string): any {
  const when = atIso || nowIso();
  const rows = dao.undelivered();
  let delivered = 0;
  let moving = 0;
  let failed = 0;
  for (const s of rows) {
    const info = track(s, when);
    if (!info.delivered) {
      if (s.state === SHIPMENT_STATES.REGISTERED) {
        dao.markInTransit(s.id, when);
        moving++;
      }
      continue;
    }
    try {
      tx(() => {
        const order = loadOrderRow(s.order_id);
        const doneAt = info.events[info.events.length - 1].at;
        dao.markDelivered(s.id, doneAt);
        if (order && order.status === "shipping") getServices().adminOrders.changeStatus(s.order_id, "delivered");
      });
      emit("shipment.delivered", { orderId: s.order_id, at: when });
      delivered++;
    } catch (e) {
      failed++;
      logError("delivery_sync_failed", e, { shipmentId: s.id });
    }
  }
  return { total: rows.length, delivered: delivered, inTransit: moving, failed: failed };
}

export function shipmentOf(orderId: any): any {
  const s = dao.findByOrder(orderId);
  if (!s) return null;
  return {
    courierCode: s.courier_code,
    courierName: courierName(s.courier_code),
    trackingNo: s.tracking_no,
    registeredAt: s.registered_at,
    deliveredAt: s.delivered_at,
    state: s.state,
  };
}

export function recent(sinceIso: string): any[] {
  return dao.recentlyRegistered(sinceIso).map((r: any) => ({
    orderId: r.order_id,
    orderNumber: r.order_number,
    trackingNo: r.tracking_no,
    registeredAt: r.registered_at,
  }));
}
