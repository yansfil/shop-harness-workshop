export type PageItem = number | "gap";

/**
 * 페이지 번호 줄. 7쪽까지는 모두, 그 넘으면 처음·끝과 지금 쪽 둘레만 보이고 나머지는 "gap"(…)이다.
 * 예: 1쪽 → 1 2 3 4 5 … 115, 50쪽 → 1 … 49 50 51 … 115
 */
export function pageWindow(page: number, pageCount: number): PageItem[] {
  const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  if (pageCount <= 7) return range(1, pageCount);
  if (page <= 4) return [...range(1, 5), "gap", pageCount];
  if (page >= pageCount - 3) return [1, "gap", ...range(pageCount - 4, pageCount)];
  return [1, "gap", page - 1, page, page + 1, "gap", pageCount];
}
