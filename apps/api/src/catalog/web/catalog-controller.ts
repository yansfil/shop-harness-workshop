import {
  ProductParamsSchema,
  ProductSearchQuerySchema,
  ProductSuggestQuerySchema,
  ROUTES,
  SUGGEST_LIMIT,
} from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import type { CatalogService } from "../application/catalog-service.ts";
import { toCategoryListDto, toProductDetailDto, toSearchDto, toSuggestDto } from "./catalog-mapper.ts";

export class CatalogController implements Controller {
  readonly #catalog: CatalogService;

  constructor(catalog: CatalogService) {
    this.#catalog = catalog;
  }

  register(router: Router): void {
    router.get(ROUTES.categories, (_req, res) => {
      res.json(toCategoryListDto(this.#catalog.listCategories()));
    });

    router.get(ROUTES.products, (req, res) => {
      const query = ProductSearchQuerySchema.parse(req.query);
      res.json(toSearchDto(this.#catalog.search({ ...query, q: query.q ?? "" })));
    });

    // /suggest는 :productId보다 먼저 등록해야 한다.
    router.get(ROUTES.productSuggest, (req, res) => {
      const { q } = ProductSuggestQuerySchema.parse(req.query);
      res.json(toSuggestDto(this.#catalog.suggest(q, SUGGEST_LIMIT)));
    });

    router.get(ROUTES.product, (req, res) => {
      const { productId } = ProductParamsSchema.parse(req.params);
      res.json(toProductDetailDto(this.#catalog.getProduct(productId)));
    });
  }
}
