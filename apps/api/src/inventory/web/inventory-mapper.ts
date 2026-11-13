import type { InboundResponse, InventoryItem as InventoryItemDto, InventoryListResponse, InventoryMovement as MovementDto, InventoryMovementsResponse } from "@grabmarket/contracts";
import type { InboundResult, MovementHistory } from "../application/inventory-service.ts";
import { type InventoryItem, isLowStock, type StockMovement } from "../domain/stock.ts";

export function toInventoryItemDto(item: InventoryItem): InventoryItemDto {
  return {
    productId: item.productId,
    productName: item.productName,
    categoryName: item.categoryName,
    quantity: item.quantity,
    safetyStock: item.safetyStock,
    lowStock: isLowStock(item),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toMovementDto(movement: StockMovement): MovementDto {
  return {
    id: movement.id,
    kind: movement.kind,
    quantityDelta: movement.quantityDelta,
    quantityAfter: movement.quantityAfter,
    orderNumber: movement.orderNumber,
    memo: movement.memo,
    createdByName: movement.createdByName,
    createdAt: movement.createdAt.toISOString(),
  };
}

export function toInventoryListDto(items: InventoryItem[]): InventoryListResponse {
  return { items: items.map(toInventoryItemDto) };
}

export function toMovementsDto(history: MovementHistory): InventoryMovementsResponse {
  return { item: toInventoryItemDto(history.item), movements: history.movements.map(toMovementDto) };
}

export function toInboundDto(result: InboundResult): InboundResponse {
  return { item: toInventoryItemDto(result.item), movement: toMovementDto(result.movement) };
}
