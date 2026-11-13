import { InboundRequestSchema, InventoryParamsSchema, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireAdmin } from "../../shared/web/session.ts";
import type { InventoryService } from "../application/inventory-service.ts";
import { toInboundDto, toInventoryListDto, toMovementsDto } from "./inventory-mapper.ts";

export class InventoryController implements Controller {
  readonly #inventory: InventoryService;

  constructor(inventory: InventoryService) {
    this.#inventory = inventory;
  }

  register(router: Router): void {
    router.get(ROUTES.adminInventory, (_req, res) => {
      requireAdmin(res);
      res.json(toInventoryListDto(this.#inventory.list()));
    });

    router.get(ROUTES.adminInventoryMovements, (req, res) => {
      requireAdmin(res);
      const { productId } = InventoryParamsSchema.parse(req.params);
      res.json(toMovementsDto(this.#inventory.history(productId)));
    });

    router.post(ROUTES.adminInventoryInbound, (req, res) => {
      const admin = requireAdmin(res);
      const { productId } = InventoryParamsSchema.parse(req.params);
      const body = InboundRequestSchema.parse(req.body);
      const result = this.#inventory.registerInbound(admin, productId, body);
      res.status(result.created ? 201 : 200).json(toInboundDto(result));
    });
  }
}
