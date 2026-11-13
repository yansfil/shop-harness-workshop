import { z } from "zod";
import { DateTimeSchema, IdempotencyKeySchema, IdSchema } from "./common.ts";

export const InventoryItemSchema = z.object({
  productId: IdSchema,
  productName: z.string(),
  categoryName: z.string(),
  quantity: z.number().int().nonnegative(),
  /** 이 수량보다 적으면 부족하다고 보는 기준. 값은 시드가 정한다. */
  safetyStock: z.number().int().nonnegative(),
  /** 수량이 안전재고보다 적으면 true(품절 포함, 같으면 false). 서버가 계산하고 화면은 그대로 보인다. */
  lowStock: z.boolean(),
  updatedAt: DateTimeSchema,
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/** GET /api/admin/inventory (관리자). 상품 전부, 상품 id 순. 상품마다 안전재고(safetyStock)와 안전재고 미만 여부(lowStock)를 준다. */
export const InventoryListResponseSchema = z.object({ items: z.array(InventoryItemSchema) });
export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;

export const InventoryParamsSchema = z.object({ productId: z.coerce.number().int().positive() });

export const MovementKindSchema = z.enum(["inbound", "outbound"]);
export type MovementKind = z.infer<typeof MovementKindSchema>;
export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = { inbound: "입고", outbound: "출고" };

export const InventoryMovementSchema = z.object({
  id: IdSchema,
  kind: MovementKindSchema,
  /** 부호 있는 변화량(입고 +, 출고 -) */
  quantityDelta: z.number().int(),
  quantityAfter: z.number().int().nonnegative(),
  /** 주문 출고면 그 주문 번호 */
  orderNumber: z.string().nullable(),
  memo: z.string().nullable(),
  /** 입고를 등록한 관리자 이름 */
  createdByName: z.string().nullable(),
  createdAt: DateTimeSchema,
});
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

/** GET /api/admin/inventory/:productId/movements (관리자). 최신순 전부. 없는 상품이면 404 NOT_FOUND */
export const InventoryMovementsResponseSchema = z.object({
  item: InventoryItemSchema,
  movements: z.array(InventoryMovementSchema),
});
export type InventoryMovementsResponse = z.infer<typeof InventoryMovementsResponseSchema>;

/**
 * POST /api/admin/inventory/:productId/inbound (관리자) → 201 InboundResponseSchema.
 * 같은 idempotencyKey로 다시 보내면 200과 처음 결과(수량은 한 번만 늘어난다).
 */
export const InboundRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  quantity: z.number().int().min(1).max(10_000),
  memo: z.string().trim().max(100).optional(),
});
export type InboundRequest = z.infer<typeof InboundRequestSchema>;

export const InboundResponseSchema = z.object({
  item: InventoryItemSchema,
  movement: InventoryMovementSchema,
});
export type InboundResponse = z.infer<typeof InboundResponseSchema>;
