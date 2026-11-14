import { Link } from "react-router";
import type { InfoRow } from "./info-table.tsx";

/**
 * 교환·반품 안내. 상품 상세 "교환·반품 안내" 탭과 고객센터가 모두 여기서 가져온다.
 * 글은 그 브랜치의 실제 기능과 맞아야 한다. 지금은 신청 기능이 없어 고객센터로 알리라고 쓴다.
 * 신청 방법이 바뀌면 이 파일만 고친다.
 * where: 상품 상세에서는 "고객센터"를 고객센터 화면 링크로 두고, 고객센터 화면 안에서는 그 말을 뺀다.
 */
export function returnPolicyRows(where: "product" | "help"): InfoRow[] {
  return [
    {
      label: "신청 기간",
      value:
        where === "product" ? (
          <>
            받은 날부터 7일 안에{" "}
            <Link to="/help" className="font-semibold text-ink underline underline-offset-2">
              고객센터
            </Link>
            로 알려 주세요
          </>
        ) : (
          "받은 날부터 7일 안에 알려 주세요"
        ),
    },
    { label: "안 되는 경우", value: "신선식품은 단순 변심으로 교환·반품할 수 없어요" },
  ];
}
