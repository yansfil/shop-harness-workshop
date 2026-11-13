// API 서버 진입점: 설정 검사 → DB 열기·마이그레이션 → 조립 → loopback(127.0.0.1)에서만 듣기.
import { migrate, openDatabase } from "@grabmarket/db";
import { systemClock } from "@grabmarket/shared";
import { composeApp } from "./composition.ts";
import { loadConfig } from "./config.ts";
import { startLegacyWorkers, stopLegacyWorkers } from "./legacy/legacyBootstrap.ts";

const HOST = "127.0.0.1";

const config = loadConfig();
const db = openDatabase(config.databasePath);
migrate(db, systemClock);
const app = composeApp({ db, clock: systemClock });

const server = app.listen(config.apiPort, HOST, (error?: Error) => {
  if (error) {
    console.error(JSON.stringify({ event: "api_listen_failed", port: config.apiPort, error: error.message }));
    db.close();
    process.exit(1);
  }
  console.log(`그랩마켓 API: http://${HOST}:${config.apiPort}`);
  startLegacyWorkers();
});

function shutdown(): void {
  stopLegacyWorkers();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
