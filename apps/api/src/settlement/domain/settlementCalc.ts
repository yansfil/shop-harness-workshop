// 정산 계산
// 주문의 쿠폰 할인·포인트 사용은 상품 줄 금액 비중대로 나눠 상품 줄마다 정산 금액을 낸다(카테고리별 정산과 같은 방식).
import type { ItemSettlementRow, OrderSettlementRow } from "../infra/settlementQueries.ts";

export interface SettlementRow {
  key: string;
  orderCount: number;
  goods: number;
  shipping: number;
  coupon: number;
  point: number;
  net: number;
}

export function emptyRow(key: string): SettlementRow {
  return { key: key, orderCount: 0, goods: 0, shipping: 0, coupon: 0, point: 0, net: 0 };
}

/** 주문 한 건을 상품 줄로 나눈다 */
export function splitOrder(order: OrderSettlementRow, items: ItemSettlementRow[]): any[] {
  const subtotal = order.subtotal || 0;
  return items.map((item: any) => {
    const ratio = subtotal > 0 ? item.line_total / subtotal : 0;
    const coupon = order.coupon_discount * ratio;
    const point = order.point_used * ratio;
    return {
      orderId: order.id,
      itemId: item.id,
      goods: item.line_total,
      coupon: coupon,
      point: point,
      net: item.line_total - coupon - point,
    };
  });
}

/** 상품 줄 하나를 원 단위로 */
export function roundLine(line: any): any {
  const coupon = Math.round(line.coupon);
  const point = Math.round(line.point);
  return { ...line, coupon: coupon, point: point, net: line.goods - coupon - point };
}

/** 주문 한 건의 정산 (상품 줄을 원 단위로 맞춘 뒤 더한다) */
export function settleOrder(order: OrderSettlementRow, items: ItemSettlementRow[]): SettlementRow {
  const row = emptyRow(String(order.id));
  row.orderCount = 1;
  row.shipping = order.shipping_fee || 0;
  for (const line of splitOrder(order, items).map(roundLine)) {
    row.goods += line.goods;
    row.coupon += line.coupon;
    row.point += line.point;
  }
  row.net = row.goods + row.shipping - row.coupon - row.point;
  return row;
}

export function addRow(target: SettlementRow, add: SettlementRow): SettlementRow {
  target.orderCount += add.orderCount;
  target.goods += add.goods;
  target.shipping += add.shipping;
  target.coupon += add.coupon;
  target.point += add.point;
  target.net += add.net;
  return target;
}

export function totalOf(rows: SettlementRow[], key?: string): SettlementRow {
  const total = emptyRow(key || "total");
  for (const r of rows) addRow(total, r);
  return total;
}

/** 월별 합계 행: SQL이 더한 값을 원 단위로 */
export function monthRow(month: string, sums: any, shipping: number): SettlementRow {
  const goods = Number(sums.goods || 0);
  const coupon = Math.round(Number(sums.coupon || 0));
  const point = Math.round(Number(sums.point || 0));
  return {
    key: month,
    orderCount: Number(sums.order_count || 0),
    goods: goods,
    shipping: shipping,
    coupon: coupon,
    point: point,
    net: goods + shipping - coupon - point,
  };
}

export function toDto(row: SettlementRow): any {
  return {
    key: row.key,
    orderCount: row.orderCount,
    goodsAmount: row.goods,
    shippingAmount: row.shipping,
    couponDiscount: row.coupon,
    pointUsed: row.point,
    netAmount: row.net,
  };
}
