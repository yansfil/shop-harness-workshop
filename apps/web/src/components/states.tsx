import type { ReactNode } from "react";

/** 비어 있을 때. 제목 한 줄, 안내 한 줄, 다음에 할 일(선택). */
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <h2 className="text-lg font-extrabold text-ink">{title}</h2>
      {hint !== undefined && <p className="text-sm text-ink-2">{hint}</p>}
      {children !== undefined && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** 불러오지 못했을 때. 빨간 한 줄과 다시 시도. */
export function FailureState({ title, hint, onRetry, retrying = false }: { title: string; hint?: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-base font-extrabold text-danger">{title}</p>
      {hint !== undefined && <p className="text-sm text-ink-2">{hint}</p>}
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex h-10 items-center rounded-md border-2 border-ink bg-ground px-5 text-sm font-bold text-ink disabled:border-layer-edge disabled:text-ink-3"
        >
          {retrying ? "다시 불러오는 중" : "다시 시도"}
        </button>
      )}
    </div>
  );
}

/** 불러오는 중인 자리. 회색 막대. */
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-sm bg-line ${className}`} />;
}

export function LoadingLabel({ children }: { children: string }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  );
}
