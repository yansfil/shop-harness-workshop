import { addMoney, type Money, multiplyMoney, sumMoney } from "@grabmarket/shared";
import { calculateShippingFee } from "./shipping-fee.ts";
import type { OrderStatus } from "./order-status.ts";

export interface CartLine {
  productId: number;
  quantity: number;
}

export interface ShippingInfo {
  recipientName: string;
  phone: string;
  address: string;
}

export interface PlaceOrderInput {
  idempotencyKey: string;
  items: CartLine[];
  shipping: ShippingInfo;
  paymentMethod: "virtual";
}

/** 서버가 가격을 다시 계산한 주문 줄 */
export interface PricedLine {
  productId: number;
  productName: string;
  imagePath: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
}

export interface PricedOrder {
  items: PricedLine[];
  subtotal: Money;
  shippingFee: Money;
  /** 결제 금액 = subtotal + shippingFee */
  total: Money;
}

export interface Order extends PricedOrder {
  id: number;
  number: string;
  customer: { id: number; name: string; email: string };
  status: OrderStatus;
  paymentMethod: "virtual";
  shipping: ShippingInfo;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewOrder extends PricedOrder {
  number: string;
  customerId: number;
  idempotencyKey: string;
  paymentMethod: "virtual";
  shipping: ShippingInfo;
  createdAt: Date;
}

/** 관리자 주문 목록의 한 줄 */
export interface AdminOrderRow {
  id: number;
  number: string;
  customerName: string;
  status: OrderStatus;
  total: Money;
  itemCount: number;
  firstItemName: string;
  createdAt: Date;
}

/** 관리자 주문 목록의 조건. q가 빈 문자열이면 검색 조건 없음 */
export interface AdminOrderFilter {
  status?: OrderStatus;
  /** 주문번호나 고객 이름의 일부 */
  q: string;
}

/** 목록에서 한 주문의 자리. 정렬(최신순, 같은 시각이면 id가 큰 순)이 정하는 위치라서 커서가 된다. */
export interface OrderPosition {
  createdAt: Date;
  id: number;
}

/** 번호 방식(page)과 커서 방식(after: 이 자리 바로 뒤부터) */
export type AdminOrderPaging = { kind: "page"; page: number; pageSize: number } | { kind: "after"; after: OrderPosition; pageSize: number };

export type OrderStatusCounts = Record<OrderStatus, number>;

export interface AdminOrderSlice {
  rows: AdminOrderRow[];
  /** 이 조각 뒤에 주문이 더 있는가 */
  hasMore: boolean;
}

export interface ProductPrice {
  id: number;
  name: string;
  price: Money;
  imagePath: string;
}

/** 단가는 항상 서버의 상품 가격이다. 요청에는 가격이 없다. products는 lines와 같은 순서다. */
export function priceOrder(products: ProductPrice[], lines: CartLine[]): PricedOrder {
  const items = lines.map((line, index): PricedLine => {
    const product = products[index];
    if (product?.id !== line.productId) throw new Error("상품 목록이 주문 줄과 같은 순서가 아닙니다");
    return {
      productId: product.id,
      productName: product.name,
      imagePath: product.imagePath,
      unitPrice: product.price,
      quantity: line.quantity,
      lineTotal: multiplyMoney(product.price, line.quantity),
    };
  });
  const subtotal = sumMoney(items.map((item) => item.lineTotal));
  const shippingFee = calculateShippingFee(subtotal);
  return { items, subtotal, shippingFee, total: addMoney(subtotal, shippingFee) };
}

/** 같은 멱등 키의 다시 보낸 요청인지: 상품·수량·배송지가 처음 주문과 같아야 한다. */
export function isSameRequest(order: Order, input: PlaceOrderInput): boolean {
  const key = (lines: CartLine[]): string =>
    lines
      .map((line) => `${line.productId}x${line.quantity}`)
      .sort()
      .join(",");
  return (
    key(order.items) === key(input.items) &&
    order.shipping.recipientName === input.shipping.recipientName &&
    order.shipping.phone === input.shipping.phone &&
    order.shipping.address === input.shipping.address
  );
}

/** 화면 표기용 번호: GM-20261114-0001 (그날 몇 번째 주문인지) */
export function formatOrderNumber(at: Date, sequence: number): string {
  return `GM-${orderDayKey(at)}-${String(sequence).padStart(4, "0")}`;
}

export function orderDayKey(at: Date): string {
  return at.toISOString().slice(0, 10).replaceAll("-", "");
}

export interface OrderRepository {
  insert(order: NewOrder): Order;
  /** 그날(orderDayKey) 이미 만들어진 주문 수 */
  countOnDay(dayKey: string): number;
  findByIdempotencyKey(customerId: number, idempotencyKey: string): Order | undefined;
  findById(orderId: number): Order | undefined;
  /** 이 고객의 주문만. 남의 주문이면 undefined */
  findForCustomer(customerId: number, orderId: number): Order | undefined;
  /** 이 고객의 주문 전부, 최신순 */
  listByCustomer(customerId: number): Order[];
  /** 조건에 맞는 주문을 최신순으로 한 페이지만 */
  listAdmin(filter: AdminOrderFilter, paging: AdminOrderPaging): AdminOrderSlice;
  /** 상태별 주문 수. 검색어(q)만 적용하고 filter.status는 보지 않는다 */
  countByStatus(q: string): OrderStatusCounts;
  saveStatus(orderId: number, status: OrderStatus, at: Date): void;
}
