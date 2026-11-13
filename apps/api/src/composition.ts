// 조립 파일: repository → service → controller를 여기서 한 번만 만들고 생성자로 넘긴다.
// 다른 파일은 의존성을 직접 new 하지 않는다.
import type { Database } from "@grabmarket/db";
import type { Clock } from "@grabmarket/shared";
import type { Express } from "express";
import { createApp } from "./app.ts";
import { AuthService } from "./auth/application/auth-service.ts";
import { CryptoSessionTokens } from "./auth/infra/crypto-session-tokens.ts";
import { ScryptPasswordHasher } from "./auth/infra/scrypt-password-hasher.ts";
import { SqliteSessionRepository } from "./auth/infra/sqlite-session-repository.ts";
import { SqliteUserRepository } from "./auth/infra/sqlite-user-repository.ts";
import { AuthController } from "./auth/web/auth-controller.ts";
import { createSessionMiddleware } from "./auth/web/session-middleware.ts";
import { CatalogService } from "./catalog/application/catalog-service.ts";
import { SqliteCatalogRepository } from "./catalog/infra/sqlite-catalog-repository.ts";
import { CatalogController } from "./catalog/web/catalog-controller.ts";
import { InventoryService } from "./inventory/application/inventory-service.ts";
import { SqliteInventoryRepository } from "./inventory/infra/sqlite-inventory-repository.ts";
import { InventoryController } from "./inventory/web/inventory-controller.ts";
import { AdminOrderService } from "./orders/application/admin-order-service.ts";
import { OrderService } from "./orders/application/order-service.ts";
import { SqliteOrderRepository } from "./orders/infra/sqlite-order-repository.ts";
import { AdminOrderController } from "./orders/web/admin-order-controller.ts";
import { MyOrderController } from "./orders/web/my-order-controller.ts";
import { OrderController } from "./orders/web/order-controller.ts";
import { SqliteUnitOfWork } from "./shared/infra/sqlite-unit-of-work.ts";
import { HealthController } from "./shared/web/health-controller.ts";

export interface AppDependencies {
  db: Database;
  clock: Clock;
}

/** 서비스까지 조립한다. 시드와 주문 시뮬레이터는 HTTP 없이 같은 서비스를 쓴다. */
export function composeServices({ db, clock }: AppDependencies) {
  const uow = new SqliteUnitOfWork(db);
  const auth = new AuthService(
    new SqliteUserRepository(db),
    new SqliteSessionRepository(db),
    new ScryptPasswordHasher(),
    new CryptoSessionTokens(),
    clock,
  );
  const catalog = new CatalogService(new SqliteCatalogRepository(db));
  const inventory = new InventoryService(new SqliteInventoryRepository(db), uow, clock);
  const orderRepository = new SqliteOrderRepository(db);
  const orders = new OrderService(orderRepository, catalog, inventory, uow, clock);
  const adminOrders = new AdminOrderService(orderRepository, uow, clock);
  return { auth, catalog, inventory, orders, adminOrders, orderRepository };
}

export function composeApp(dependencies: AppDependencies): Express {
  const { auth, catalog, inventory, orders, adminOrders, orderRepository } = composeServices(dependencies);
  return createApp(createSessionMiddleware(auth), [
    new HealthController(),
    new AuthController(auth),
    new CatalogController(catalog),
    new OrderController(orders),
    new MyOrderController(orderRepository),
    new AdminOrderController(adminOrders),
    new InventoryController(inventory),
  ]);
}
