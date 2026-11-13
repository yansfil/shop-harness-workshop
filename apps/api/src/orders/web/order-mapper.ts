import type { AdminOrderListResponse, AdminOrderResponse, OrderDetail, OrderQuoteResponse, OrderResponse } from "@grabmarket/contracts";
import type { AdminOrderView } from "../application/admin-order-service.ts";
import type { Quote } from "../application/order-service.ts";
import type { AdminOrderRow, Order } from "../domain/order.ts";

export function toOrderDetailDto(order: Order): OrderDetail {
  return {
    id: order.id,
    orderNumber: order.number,
    status: order.status,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      imageUrl: item.imagePath,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    shipping: order.shipping,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function toOrderResponse(order: Order): OrderResponse {
  return { order: toOrderDetailDto(order) };
}

export function toQuoteDto(quote: Quote): OrderQuoteResponse {
  return {
    items: quote.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: quote.subtotal,
    shippingFee: quote.shippingFee,
    total: quote.total,
    shortages: quote.shortages,
  };
}

export function toAdminOrderListDto(rows: AdminOrderRow[]): AdminOrderListResponse {
  return {
    orders: rows.map((row) => ({
      id: row.id,
      orderNumber: row.number,
      customerName: row.customerName,
      status: row.status,
      total: row.total,
      itemCount: row.itemCount,
      firstItemName: row.firstItemName,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export function toAdminOrderDto({ order, nextStatus }: AdminOrderView): AdminOrderResponse {
  return { order: { ...toOrderDetailDto(order), customer: order.customer, nextStatus } };
}
