import type { ReactNode } from "react";

/** 고객 화면 본문 폭과 좌우 여백(데스크톱 32px, 모바일 16px). */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-6 md:px-8 ${className}`}>{children}</div>;
}
