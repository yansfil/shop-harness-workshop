// 정산 계산
// 주문 한 건의 쿠폰 할인·포인트 사용은 이미 원 단위 정수다. 나누거나 반올림하지 않고 그대로 더한다.
// 그래서 일별·월별·실제 결제 금액이 항상 같은 값이 나온다.

/** 정산 대상 주문 한 줄(금액은 모두 정수 원) */
export interface OrderSettlementRow {
  id: number;
  subtotal: number;
  shipping_fee: number;
  coupon_discount: number;
  point_used: number;
}

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

/** 주문 한 건의 정산 */
export function settleOrder(order: OrderSettlementRow): SettlementRow {
  const row = emptyRow(String(order.id));
  row.orderCount = 1;
  row.goods = order.subtotal;
  row.shipping = order.shipping_fee;
  row.coupon = order.coupon_discount;
  row.point = order.point_used;
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

/** 월별 합계 행: SQL이 더한 정수 합계 */
export function monthRow(month: string, sums: any, shipping: number): SettlementRow {
  const goods = Number(sums.goods || 0);
  const coupon = Number(sums.coupon || 0);
  const point = Number(sums.point || 0);
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
