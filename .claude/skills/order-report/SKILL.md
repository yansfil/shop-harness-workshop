---
name: order-report
description: 그랩마켓 DB의 주문 통계(상태별 주문 수, 최근 30일 일별 매출, 판매 상위 상품)를 HTML 리포트로 만든다. 주문 현황·매출 요약·주문 리포트를 요청받을 때 쓴다.
allowed-tools: Bash(node .claude/skills/order-report/report.ts)
---

# 주문 리포트

DB를 읽기만 해서 `reports/order-report.html`을 만든다. 데이터를 바꾸지 않는다.

1. `node .claude/skills/order-report/report.ts`를 실행한다.
2. 출력에 나온 파일 경로와 요약 숫자(전체 주문 수, 총 매출)를 사용자에게 알려 준다.
3. 스크립트가 실패하면 오류 문장을 그대로 전한다. DB 파일이 없으면 `npm run db:reset`을 안내하고, 대신 실행하지 않는다.

리포트는 `reports/` 아래에 만들어지고 git에 올라가지 않는다.
