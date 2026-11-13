import type { Clock } from "@grabmarket/shared";
import { DomainError, notFound } from "../../shared/domain/domain-error.ts";
import type { SessionUser } from "../../shared/domain/session-user.ts";
import type { UnitOfWork } from "../../shared/application/unit-of-work.ts";
import {
  findShortages,
  type InventoryItem,
  type InventoryRepository,
  type StockLine,
  type StockMovement,
  type StockShortage,
} from "../domain/stock.ts";

export interface InboundRequest {
  idempotencyKey: string;
  quantity: number;
  memo?: string | undefined;
}

export interface InboundResult {
  /** 같은 키의 다시 보낸 요청이면 false */
  created: boolean;
  item: InventoryItem;
  movement: StockMovement;
}

export interface MovementHistory {
  item: InventoryItem;
  movements: StockMovement[];
}

/** 재고 수량을 바꾸는 유일한 곳. 바꿀 때마다 입출고 이력 한 줄을 같은 트랜잭션에 남긴다. */
export class InventoryService {
  readonly #inventory: InventoryRepository;
  readonly #uow: UnitOfWork;
  readonly #clock: Clock;

  constructor(inventory: InventoryRepository, uow: UnitOfWork, clock: Clock) {
    this.#inventory = inventory;
    this.#uow = uow;
    this.#clock = clock;
  }

  list(): InventoryItem[] {
    return this.#inventory.list();
  }

  history(productId: number): MovementHistory {
    const item = this.#inventory.findItem(productId);
    if (item === undefined) throw notFound("상품");
    return { item, movements: this.#inventory.listMovements(productId) };
  }

  /** 읽기만 한다. 견적에서 부족분을 미리 보여 줄 때 쓴다. */
  findShortages(lines: StockLine[]): StockShortage[] {
    return findShortages(lines, this.#inventory.quantities(lines.map((line) => line.productId)));
  }

  /**
   * 주문 한 건의 재고를 모두 차감한다. 한 줄이라도 모자라면 아무것도 바꾸지 않고 부족분을 돌려준다.
   * 주문 트랜잭션 안에서 부른다.
   */
  decreaseForOrder(orderId: number, lines: StockLine[]): StockShortage[] {
    return this.#uow.run(() => {
      const quantities = this.#inventory.quantities(lines.map((line) => line.productId));
      const shortages = findShortages(lines, quantities);
      if (shortages.length > 0) return shortages;
      const at = this.#clock.now();
      for (const line of lines) {
        const after = (quantities.get(line.productId) ?? 0) - line.quantity;
        this.#inventory.setQuantity(line.productId, after, at);
        this.#inventory.insertMovement({
          productId: line.productId,
          kind: "outbound",
          quantityDelta: -line.quantity,
          quantityAfter: after,
          orderId,
          memo: null,
          idempotencyKey: null,
          createdBy: null,
          createdAt: at,
        });
      }
      return [];
    });
  }

  /** 입고를 등록한다. 같은 키로 다시 보내면 수량을 다시 늘리지 않고 처음 결과를 돌려준다. */
  registerInbound(admin: SessionUser, productId: number, request: InboundRequest): InboundResult {
    return this.#uow.run(() => {
      const existing = this.#inventory.findMovementByKey(request.idempotencyKey);
      if (existing !== undefined) {
        if (existing.productId !== productId || existing.quantityDelta !== request.quantity) {
          throw new DomainError("IDEMPOTENCY_KEY_REUSED", "같은 요청 번호로 다른 입고를 보낼 수 없습니다.");
        }
        return { created: false, item: this.#requireItem(productId), movement: existing };
      }
      const current = this.#requireItem(productId);
      const at = this.#clock.now();
      const after = current.quantity + request.quantity;
      this.#inventory.setQuantity(productId, after, at);
      const movement = this.#inventory.insertMovement({
        productId,
        kind: "inbound",
        quantityDelta: request.quantity,
        quantityAfter: after,
        orderId: null,
        memo: request.memo === undefined || request.memo === "" ? null : request.memo,
        idempotencyKey: request.idempotencyKey,
        createdBy: admin.id,
        createdAt: at,
      });
      return { created: true, item: this.#requireItem(productId), movement };
    });
  }

  #requireItem(productId: number): InventoryItem {
    const item = this.#inventory.findItem(productId);
    if (item === undefined) throw notFound("상품");
    return item;
  }
}
