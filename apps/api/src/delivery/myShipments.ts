// 고객 배송 모아 보기: 배송중·도착·출고 전 주문을 한 화면에
import {
  addBusinessDays,
  courierName,
  fmtMdHm,
  fmtMdWeek,
  groupBy,
  itemSummary,
  now,
  relativeDayText,
  shortOrderNo,
  sqlIn,
  all,
  ORDER_STATUS_TEXT,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/shipmentDao.ts";
import { track } from "./infra/fakeCourierApi.ts";
import { currentStep, expectedArrival, TRACKING_STEPS } from "./domain/trackingSteps.ts";

function itemsByOrder(orderIds: number[]): any {
  if (orderIds.length === 0) return {};
  return groupBy(all("SELECT order_id, product_name FROM order_items WHERE order_id IN " + sqlIn(orderIds) + " ORDER BY order_id, id"), "order_id");
}

export function myShipments(user: any): any {
  const shipments = dao.shipmentsOfCustomer(user.id, 50);
  const waiting = dao.unshippedOfCustomer(user.id);
  const items = itemsByOrder(shipments.map((s: any) => Number(s.order_id)).concat(waiting.map((o: any) => Number(o.id))));
  const current = now();
  const moving: any[] = [];
  const arrived: any[] = [];
  for (const s of shipments) {
    const info = track(s, current);
    const step = currentStep(info.events);
    const stepIndex = step ? TRACKING_STEPS.findIndex((x: any) => x.key === step.key) : -1;
    const row = {
      orderId: s.order_id,
      shortOrderNumber: shortOrderNo(s.order_number),
      itemSummary: itemSummary(items[s.order_id] || []),
      courierName: courierName(s.courier_code),
      trackingNo: s.tracking_no,
      stepKey: step ? step.key : null,
      stepText: step ? step.title : "접수",
      stepIndex: stepIndex,
      stepCount: TRACKING_STEPS.length,
      registeredAtText: fmtMdHm(s.registered_at),
      arrivalText: s.delivered_at ? fmtMdHm(s.delivered_at) + " 도착" : relativeDayText(expectedArrival(s.registered_at)) + " 도착 예정",
    };
    if (s.delivered_at || info.delivered) arrived.push(row);
    else moving.push(row);
  }
  return {
    moving: moving,
    arrived: arrived.slice(0, 20),
    waiting: waiting.map((o: any) => ({
      orderId: o.id,
      shortOrderNumber: shortOrderNo(o.order_number),
      itemSummary: itemSummary(items[o.id] || []),
      status: o.status,
      statusText: ORDER_STATUS_TEXT[o.status],
      orderedAtText: fmtMdHm(o.created_at),
      shipByText: fmtMdWeek(addBusinessDays(o.created_at, 2)) + "까지 출고",
    })),
  };
}
