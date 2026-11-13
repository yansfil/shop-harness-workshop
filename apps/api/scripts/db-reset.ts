// npm run db:reset: DB의 모든 테이블을 지우고 마이그레이션과 시드를 다시 적용한다.
// 끝에 시드 내용의 해시를 보여 준다. 두 번 돌려 같은 해시가 나오면 24명 모두 같은 데이터다.
import { fingerprintDatabase, openDatabase } from "@grabmarket/db";
import { loadConfig } from "../src/config.ts";
import { resetAndSeedDatabase } from "../src/seed/seed-database.ts";

const { databasePath } = loadConfig();
const db = openDatabase(databasePath);
try {
  const startedAt = performance.now();
  resetAndSeedDatabase(db);
  const { hash, rowCounts } = fingerprintDatabase(db);
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`DB를 다시 채웠습니다 (${seconds}초): ${databasePath}`);
  console.log(`행 수: ${Object.entries(rowCounts).map(([table, count]) => `${table} ${count}`).join(", ")}`);
  console.log(`시드 해시: ${hash}`);
} finally {
  db.close();
}
