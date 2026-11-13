import type { Database } from "@grabmarket/db";

/** SELECT 결과를 행 타입으로 읽는다. 행 타입은 SELECT 문장과 함께 각 저장소가 정한다. */
export function selectAll<Row>(db: Database, sql: string, ...params: (string | number | null)[]): Row[] {
  return db.prepare(sql).all(...params) as unknown as Row[];
}
