// npm run orders:simulate: 몇 초마다 새 주문을 만든다. Ctrl+C로 멈춘다.
// 개발·테스트용 옵션: --interval-ms=<고정 간격(ms)> --max-orders=<이 개수만큼 만들고 끝냄>
import { openDatabase } from "@grabmarket/db";
import { systemClock } from "@grabmarket/shared";
import { composeServices } from "../src/composition.ts";
import { loadConfig } from "../src/config.ts";
import { DomainError } from "../src/shared/domain/domain-error.ts";
import type { SessionUser } from "../src/shared/domain/session-user.ts";
import { OrderSimulator } from "../src/seed/order-simulator.ts";
import { Prng } from "../src/seed/prng.ts";

function option(name: string): number | undefined {
  const argument = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  if (argument === undefined) return undefined;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`--${name}은 0 이상의 정수여야 합니다`);
  return value;
}

const fixedIntervalMs = option("interval-ms");
const maxOrders = option("max-orders");
const prng = new Prng(1_114);
const db = openDatabase(loadConfig().databasePath);
const services = composeServices({ db, clock: systemClock });
const customers = (db.prepare("SELECT id, email, name, role, phone, address FROM users WHERE role = 'customer' ORDER BY id").all() as unknown as SessionUser[]);
const simulator = new OrderSimulator(services.orders, services.catalog, customers, prng, systemClock);

let placed = 0;
let timer: NodeJS.Timeout | undefined;

function stop(code: number): void {
  if (timer !== undefined) clearTimeout(timer);
  db.close();
  console.log(`멈췄습니다. 새로 만든 주문 ${placed}건`);
  process.exit(code);
}

function tick(): void {
  try {
    const order = simulator.placeOne();
    if (order === undefined) {
      console.error("주문할 수 있는 상품이 없습니다. npm run db:reset으로 시드를 다시 채워 주세요.");
      stop(1);
      return;
    }
    placed += 1;
    console.log(`새 주문 ${order.number} ${order.customer.name} ${order.total.toLocaleString("ko-KR")}원`);
  } catch (error) {
    // 서버가 같은 순간 재고를 가져가면 이번 주문만 건너뛴다.
    if (!(error instanceof DomainError)) throw error;
    console.error(`주문을 건너뜁니다: ${error.message}`);
  }
  if (maxOrders !== undefined && placed >= maxOrders) {
    stop(0);
    return;
  }
  timer = setTimeout(tick, fixedIntervalMs ?? prng.int(2_000, 5_000));
}

process.on("SIGINT", () => {
  stop(0);
});
process.on("SIGTERM", () => {
  stop(0);
});
console.log("주문을 흘려 보냅니다. 멈추려면 Ctrl+C");
tick();
