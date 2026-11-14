import { Link } from "react-router";
import type { InfoRow } from "./info-table.tsx";

/**
 * 교환·반품 안내. 상품 상세 "교환·반품 안내" 탭과 고객센터가 모두 여기서 가져온다.
 * 글은 그 브랜치의 실제 기능과 맞아야 한다. 이 브랜치는 내 주문 상세에서 반품·교환 신청(배송완료 뒤 7일 안)과 주문 취소(결제완료·배송준비)를 한다.
 * 신청 방법이 바뀌면 이 파일만 고친다.
 * where: 상품 상세에서는 "내 주문"을 내 주문 화면 링크로 두고, 고객센터 화면에서는 바로 아래 "내 주문 보기" 버튼이 있어 글자로만 둔다.
 */
export function returnPolicyRows(where: "product" | "help"): InfoRow[] {
  return [
    {
      label: "신청 기간",
      value:
        where === "product" ? (
          <>
            배송완료 뒤 7일 안에{" "}
            <Link to="/orders" className="font-semibold text-ink underline underline-offset-2">
              내 주문
            </Link>{" "}
            상세에서 신청해 주세요
          </>
        ) : (
          "배송완료 뒤 7일 안에 내 주문 상세에서 신청해 주세요"
        ),
    },
    { label: "주문 취소", value: "결제완료·배송준비 주문은 내 주문 상세에서 취소할 수 있어요" },
    { label: "안 되는 경우", value: "배송완료 전이거나 취소된 주문은 교환·반품을 신청할 수 없어요" },
  ];
}
