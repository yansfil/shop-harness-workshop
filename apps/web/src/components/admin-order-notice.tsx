
import { Button, LinkButton } from "./button.tsx";

/** 관리자 계정으로 주문하려 할 때(O4). 고객 계정으로 로그인하라고 안내한다. */
export function AdminOrderNotice({ onClose, next }: { onClose: () => void; next: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="admin-notice-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="relative w-full max-w-110 rounded-md border border-layer-edge bg-ground p-8">
        <h2 id="admin-notice-title" className="text-lg leading-7 font-extrabold text-ink">
          관리자 계정으로는 주문할 수 없어요
        </h2>
        <p className="mt-3 text-sm leading-5.5 text-ink-2">관리자는 주문을 처리하는 계정이에요. 주문하려면 고객 계정으로 로그인해 주세요.</p>
        <div className="mt-6 flex gap-2">
          <LinkButton to={`/login?next=${encodeURIComponent(next)}`} className="flex-1">
            고객 계정으로 로그인
          </LinkButton>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

