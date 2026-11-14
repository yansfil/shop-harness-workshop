import type { z } from "zod";
import { CategoryListResponseSchema, ProductDetailResponseSchema, ProductParamsSchema, ProductSearchQuerySchema, ProductSearchResponseSchema, ProductSuggestQuerySchema, ProductSuggestResponseSchema } from "./catalog.ts";
import { LoginRequestSchema, MeResponseSchema } from "./auth.ts";
import { HealthResponseSchema } from "./common.ts";
import { EventDetailResponseSchema, EventListResponseSchema, EventParamsSchema } from "./events.ts";
import { InboundRequestSchema, InboundResponseSchema, InventoryListResponseSchema, InventoryMovementsResponseSchema, InventoryParamsSchema } from "./inventory.ts";
import {
  AdminOrderListResponseSchema,
  AdminOrderResponseSchema,
  ChangeOrderStatusRequestSchema,
  CancelOrderRequestSchema,
  CreateOrderRequestSchema,
  MyOrderListResponseSchema,
  MyOrderResponseSchema,
  OrderParamsSchema,
  OrderQuoteRequestSchema,
  OrderQuoteResponseSchema,
  OrderResponseSchema,
} from "./orders.ts";
import { ROUTES } from "./routes.ts";
import { ShippingPolicyResponseSchema } from "./shipping.ts";

/** public: 누구나, user: 로그인한 누구나, customer: 고객만, admin: 관리자만 */
export type Access = "public" | "user" | "customer" | "admin";

export interface Endpoint {
  method: "GET" | "POST";
  path: string;
  access: Access;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** 성공 응답 본문. null이면 204(본문 없음) */
  response: z.ZodType | null;
}

/** 모든 API 한눈에. 서버는 이 표대로 라우트를 등록하고, 화면은 이 표의 response로 응답을 검사한다. */
export const ENDPOINTS = {
  health: { method: "GET", path: ROUTES.health, access: "public", response: HealthResponseSchema },

  login: { method: "POST", path: ROUTES.login, access: "public", body: LoginRequestSchema, response: MeResponseSchema },
  logout: { method: "POST", path: ROUTES.logout, access: "public", response: null },
  me: { method: "GET", path: ROUTES.me, access: "user", response: MeResponseSchema },

  listCategories: { method: "GET", path: ROUTES.categories, access: "public", response: CategoryListResponseSchema },
  searchProducts: { method: "GET", path: ROUTES.products, access: "public", query: ProductSearchQuerySchema, response: ProductSearchResponseSchema },
  suggestProducts: { method: "GET", path: ROUTES.productSuggest, access: "public", query: ProductSuggestQuerySchema, response: ProductSuggestResponseSchema },
  getProduct: { method: "GET", path: ROUTES.product, access: "public", params: ProductParamsSchema, response: ProductDetailResponseSchema },

  listEvents: { method: "GET", path: ROUTES.events, access: "public", response: EventListResponseSchema },
  getEvent: { method: "GET", path: ROUTES.event, access: "public", params: EventParamsSchema, response: EventDetailResponseSchema },

  getShippingPolicy: { method: "GET", path: ROUTES.shippingPolicy, access: "public", response: ShippingPolicyResponseSchema },
  quoteOrder: { method: "POST", path: ROUTES.orderQuote, access: "public", body: OrderQuoteRequestSchema, response: OrderQuoteResponseSchema },
  createOrder: { method: "POST", path: ROUTES.orders, access: "customer", body: CreateOrderRequestSchema, response: OrderResponseSchema },
  listMyOrders: { method: "GET", path: ROUTES.orders, access: "customer", response: MyOrderListResponseSchema },
  getMyOrder: { method: "GET", path: ROUTES.order, access: "customer", params: OrderParamsSchema, response: MyOrderResponseSchema },
  cancelOrder: { method: "POST", path: ROUTES.orderCancel, access: "customer", params: OrderParamsSchema, body: CancelOrderRequestSchema, response: OrderResponseSchema },

  listAdminOrders: { method: "GET", path: ROUTES.adminOrders, access: "admin", response: AdminOrderListResponseSchema },
  getAdminOrder: { method: "GET", path: ROUTES.adminOrder, access: "admin", params: OrderParamsSchema, response: AdminOrderResponseSchema },
  changeOrderStatus: { method: "POST", path: ROUTES.adminOrderStatus, access: "admin", params: OrderParamsSchema, body: ChangeOrderStatusRequestSchema, response: AdminOrderResponseSchema },

  listInventory: { method: "GET", path: ROUTES.adminInventory, access: "admin", response: InventoryListResponseSchema },
  listInventoryMovements: { method: "GET", path: ROUTES.adminInventoryMovements, access: "admin", params: InventoryParamsSchema, response: InventoryMovementsResponseSchema },
  registerInbound: { method: "POST", path: ROUTES.adminInventoryInbound, access: "admin", params: InventoryParamsSchema, body: InboundRequestSchema, response: InboundResponseSchema },
} as const satisfies Record<string, Endpoint>;
