// 주문 통계 HTML 리포트를 reports/order-report.html에 쓴다. DB는 읽기 전용으로만 연다.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, REPO_ROOT } from "../../../apps/api/src/config.ts";
import { ReadOnlyDatabase } from "../../../tools/mcp-db/src/database-tools.ts";

const DAYS = 30;
const TOP_PRODUCTS = 10;
const STATUS_LABELS: Record<string, string> = { paid: "결제완료", preparing: "배송준비", shipping: "배송중", delivered: "배송완료" };

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const won = (value: unknown): string => `${Number(value).toLocaleString("ko-KR")}원`;

function table(headers: string[], rows: unknown[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const db = new ReadOnlyDatabase(loadConfig().databasePath);
try {
  const totals = db.query("SELECT COUNT(*), COALESCE(SUM(total), 0) FROM orders").rows[0] ?? [0, 0];
  const byStatus = db.query("SELECT status, COUNT(*), COALESCE(SUM(total), 0) FROM orders GROUP BY status ORDER BY COUNT(*) DESC").rows;
  const lastDay = db.query("SELECT MAX(date(created_at)) FROM orders").rows[0]?.[0];
  if (typeof lastDay !== "string") throw new Error("주문이 없습니다. npm run db:reset으로 시드를 채운 뒤 다시 실행하세요.");
  const daily = db.query(
    `SELECT date(created_at) AS day, COUNT(*), SUM(total) FROM orders
     WHERE date(created_at) > date('${lastDay}', '-${DAYS} days') GROUP BY day ORDER BY day DESC`,
  ).rows;
  const top = db.query(
    `SELECT product_name, SUM(quantity) AS sold, SUM(line_total) FROM order_items
     GROUP BY product_id, product_name ORDER BY sold DESC, product_name LIMIT ${TOP_PRODUCTS}`,
  ).rows;

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>그랩마켓 주문 리포트</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;color:#14161a;max-width:880px;margin:32px auto;padding:0 16px}
h1{font-size:22px}h2{font-size:17px;margin-top:32px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #d7d9dd;padding:6px 10px;text-align:left}
th{background:#f3f1ea}td:nth-child(n+2){text-align:right}.sum{display:flex;gap:24px}.sum b{font-size:24px;display:block}
</style></head><body>
<h1>그랩마켓 주문 리포트</h1>
<p>가상의 교육용 쇼핑몰 데이터입니다. 기준: DB의 가장 최근 주문일 ${escapeHtml(lastDay)}.</p>
<div class="sum"><div>전체 주문<b>${escapeHtml(Number(totals[0]).toLocaleString("ko-KR"))}건</b></div><div>총 매출<b>${escapeHtml(won(totals[1]))}</b></div></div>
<h2>상태별 주문</h2>
${table(["상태", "주문 수", "금액"], byStatus.map(([status, count, sum]) => [STATUS_LABELS[String(status)] ?? status, count, won(sum)]))}
<h2>일별 매출 (최근 ${DAYS}일)</h2>
${table(["날짜", "주문 수", "매출"], daily.map(([day, count, sum]) => [day, count, won(sum)]))}
<h2>판매 상위 상품 (${TOP_PRODUCTS}개)</h2>
${table(["상품", "판매 수량", "판매 금액"], top.map(([name, sold, sum]) => [name, sold, won(sum)]))}
</body></html>
`;
  const outputPath = path.join(REPO_ROOT, "reports", "order-report.html");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  console.log(`리포트를 만들었습니다: ${outputPath}`);
  console.log(`전체 주문 ${String(totals[0])}건, 총 매출 ${won(totals[1])}`);
} finally {
  db.close();
}
