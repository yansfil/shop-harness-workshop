import { z } from "zod";
import { DateTimeSchema, IdempotencyKeySchema, IdSchema, MoneySchema, StockShortageSchema } from "./common.ts";

/** 주문 상태. 다음 단계로만 넘어간다: paid → preparing → shipping → delivered. 결제완료·배송준비에서는 cancelled로 취소할 수 있다. */
export const OrderStatusSchema = z.enum(["paid", "preparing", "shipping", "delivered", "cancelled"]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** 화면 표기와 순서 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "결제완료",
  preparing: "배송준비",
  shipping: "배송중",
  delivered: "배송완료",
  cancelled: "취소됨",
};

/** 결제 수단은 하나뿐이다. 화면 표기: "교육용 가상 결제" */
export const PaymentMethodSchema = z.enum(["virtual"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { virtual: "교육용 가상 결제" };

export const CartLineSchema = z.object({
  productId: IdSchema,
  quantity: z.number().int().min(1).max(99),
});
export type CartLine = z.infer<typeof CartLineSchema>;

/** 같은 상품이 두 줄이면 거절한다(화면이 합쳐서 보낸다). */
const CartLinesSchema = z
  .array(CartLineSchema)
  .min(1)
  .max(50)
  .refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, {
    message: "같은 상품이 두 번 들어 있습니다",
  });

export const ShippingInfoSchema = z.object({
  recipientName: z.string().trim().min(1).max(30),
  phone: z.string().trim().regex(/^01\d-?\d{3,4}-?\d{4}$/, "휴대폰 번호 형식이 아닙니다"),
  address: z.string().trim().min(1).max(200),
});
export type ShippingInfo = z.infer<typeof ShippingInfoSchema>;

/**
 * POST /api/orders/quote (로그인 불필요). 장바구니·주문서의 금액 미리 보기.
 * 배송비 규칙은 서버 한 곳에만 있고 화면은 이 응답을 그대로 보인다. 재고가 모자라면 shortages에 담는다(오류 아님).
 */
export const OrderQuoteRequestSchema = z.object({ items: CartLinesSchema });
export type OrderQuoteRequest = z.infer<typeof OrderQuoteRequestSchema>;

export const OrderQuoteResponseSchema = z.object({
  items: z.array(
    z.object({
      productId: IdSchema,
      productName: z.string(),
      unitPrice: MoneySchema,
      quantity: z.number().int().positive(),
      lineTotal: MoneySchema,
    }),
  ),
  subtotal: MoneySchema,
  shippingFee: MoneySchema,
  /** 결제 금액 = subtotal + shippingFee */
  total: MoneySchema,
  shortages: z.array(StockShortageSchema),
});
export type OrderQuoteResponse = z.infer<typeof OrderQuoteResponseSchema>;

/**
 * POST /api/orders (고객 로그인 필요). 고객은 세션에서 정해지며 본문에 고객 ID가 없다.
 * 201 새 주문(status paid, 재고 차감). 같은 고객이 같은 idempotencyKey로 같은 내용을 다시 보내면 200과 처음 주문.
 * 실패: 401 UNAUTHENTICATED, 403 ADMIN_CANNOT_ORDER, 404 NOT_FOUND(없는 상품),
 * 409 INSUFFICIENT_STOCK(shortages, 재고 그대로), 409 IDEMPOTENCY_KEY_REUSED.
 */
export const CreateOrderRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  items: CartLinesSchema,
  /** 기본 배송지에서 시작해 이번 주문에서만 고친 값 */
  shipping: ShippingInfoSchema,
  paymentMethod: PaymentMethodSchema,
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const OrderItemSchema = z.object({
  productId: IdSchema,
  /** 주문 순간의 이름 */
  productName: z.string(),
  imageUrl: z.string(),
  unitPrice: MoneySchema,
  quantity: z.number().int().positive(),
  lineTotal: MoneySchema,
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderDetailSchema = z.object({
  id: IdSchema,
  /** 화면 표기용 주문 번호. 예: GM-20261114-0001 */
  orderNumber: z.string(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  subtotal: MoneySchema,
  shippingFee: MoneySchema,
  total: MoneySchema,
  paymentMethod: PaymentMethodSchema,
  shipping: ShippingInfoSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const OrderResponseSchema = z.object({ order: OrderDetailSchema });
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

export const OrderSummarySchema = z.object({
  id: IdSchema,
  orderNumber: z.string(),
  status: OrderStatusSchema,
  total: MoneySchema,
  itemCount: z.number().int().positive(),
  /** 목록 표기: "제주 감귤 3kg 외 2건"의 앞부분 */
  firstItemName: z.string(),
  firstItemImageUrl: z.string(),
  createdAt: DateTimeSchema,
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

/** GET /api/orders (고객 로그인 필요). 내 주문 전부, 최신순. 페이지 나누기·필터 없음 */
export const MyOrderListResponseSchema = z.object({ orders: z.array(OrderSummarySchema) });
export type MyOrderListResponse = z.infer<typeof MyOrderListResponseSchema>;

export const OrderParamsSchema = z.object({ orderId: z.coerce.number().int().positive() });

// GET /api/orders/:orderId (고객 로그인 필요) → OrderResponseSchema. 남의 주문이면 404 NOT_FOUND.

// ---- 관리자 ----

export const AdminOrderRowSchema = z.object({
  id: IdSchema,
  orderNumber: z.string(),
  customerName: z.string(),
  status: OrderStatusSchema,
  total: MoneySchema,
  itemCount: z.number().int().positive(),
  /** 목록 표기: "제주 감귤 3kg 외 2건"의 앞부분(첫 상품 이름) */
  firstItemName: z.string(),
  createdAt: DateTimeSchema,
});
export type AdminOrderRow = z.infer<typeof AdminOrderRowSchema>;

/**
 * GET /api/admin/orders (관리자). 전체 주문을 한 번에, 최신순.
 * 필터·검색·페이지 나누기는 일부러 없다(D1-A 과제). 고객이면 403 FORBIDDEN.
 */
export const AdminOrderListResponseSchema = z.object({ orders: z.array(AdminOrderRowSchema) });
export type AdminOrderListResponse = z.infer<typeof AdminOrderListResponseSchema>;

export const AdminOrderDetailSchema = OrderDetailSchema.extend({
  customer: z.object({ id: IdSchema, name: z.string(), email: z.string() }),
  /** 넘길 수 있는 다음 상태. 배송완료면 null */
  nextStatus: OrderStatusSchema.nullable(),
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;

/** GET /api/admin/orders/:orderId (관리자). 없으면 404 NOT_FOUND */
export const AdminOrderResponseSchema = z.object({ order: AdminOrderDetailSchema });
export type AdminOrderResponse = z.infer<typeof AdminOrderResponseSchema>;

/**
 * POST /api/admin/orders/:orderId/status (관리자) → AdminOrderResponseSchema.
 * status가 바로 다음 단계면 넘긴다. 이미 그 상태면 아무것도 바꾸지 않고 200(다시 보내도 같은 결과).
 * 그 밖의 전이는 409 INVALID_STATUS_TRANSITION.
 */
export const ChangeOrderStatusRequestSchema = z.object({ status: OrderStatusSchema });
export type ChangeOrderStatusRequest = z.infer<typeof ChangeOrderStatusRequestSchema>;

/**
 * POST /api/orders/:orderId/cancel (고객) → OrderResponseSchema. 결제완료·배송준비인 내 주문을 취소됨으로 바꾸고 재고를 되돌린다.
 * 이미 취소된 주문이면 바꾸지 않고 200. 배송중부터는 409 ORDER_NOT_CANCELLABLE, 남의 주문이면 404 NOT_FOUND.
 */
export const CancelOrderRequestSchema = z.object({ reason: z.string().trim().max(200).optional() });
export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;
