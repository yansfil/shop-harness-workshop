import { EventParamsSchema, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import type { EventService } from "../application/event-service.ts";
import { toEventDetailDto, toEventListDto } from "./event-mapper.ts";

export class EventController implements Controller {
  readonly #events: EventService;

  constructor(events: EventService) {
    this.#events = events;
  }

  register(router: Router): void {
    router.get(ROUTES.events, (_req, res) => {
      res.json(toEventListDto(this.#events.list()));
    });

    router.get(ROUTES.event, (req, res) => {
      const { slug } = EventParamsSchema.parse(req.params);
      res.json(toEventDetailDto(this.#events.getDetail(slug)));
    });
  }
}
