import type { ReactNode } from "react";

export interface InfoRow {
  label: string;
  value: ReactNode;
}

/** 왼쪽 칸이 이름, 오른쪽 칸이 내용인 안내 표. 상품 상세 탭과 고객센터가 같은 모양을 쓴다. */
export function InfoTable({ rows }: { rows: InfoRow[] }) {
  return (
    <table className="w-full border-t-2 border-ink bg-ground">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-line">
            <th scope="row" className="w-22 bg-canvas px-3 py-3 text-start align-top text-xs-plus font-semibold text-ink-2 md:w-40 md:px-4 md:py-3.5 md:text-sm">
              {row.label}
            </th>
            <td className="px-3 py-3 text-sm leading-6 text-ink md:px-4 md:py-3.5">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
