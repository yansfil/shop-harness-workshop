import { Button, LinkButton } from "./button.tsx";
import { loginPath } from "../lib/login-path.ts";

const TITLE = "관리자 계정으로는 주문할 수 없어요";
const BODY = "관리자는 주문을 처리하는 계정이에요. 주문하려면 고객 계정으로 로그인해 주세요.";

/** 관리자 계정으로 주문하려 할 때(O4). 고객 계정으로 로그인하라고 안내한다. */
export function AdminOrderNotice({ onClose, next }: { onClose: () => void; next: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="admin-notice-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="relative w-full max-w-110 rounded-md border border-layer-edge bg-ground p-8">
        <h2 id="admin-notice-title" className="text-lg leading-7 font-extrabold text-ink">
          {TITLE}
        </h2>
        <p className="mt-3 text-sm leading-5.5 text-ink-2">{BODY}</p>
        <div className="mt-6 flex gap-2">
          <LinkButton to={loginPath(next)} className="flex-1">
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

/** 관리자가 고객 전용 화면(내 주문 등)을 열었을 때. 주문 안내 창과 같은 안내를 화면 가운데에 보인다. */
export function AdminCustomerOnlyScreen({ next }: { next: string }) {
  return (
    <div className="mx-auto flex max-w-360 flex-col items-center gap-2 px-4 py-24 text-center">
      <h1 className="text-xl leading-8 font-extrabold text-ink">{TITLE}</h1>
      <p className="text-base text-ink-2">{BODY}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton to="/admin/orders" variant="secondary" size="lg">
          관리자 화면
        </LinkButton>
        <LinkButton to={loginPath(next)} size="lg">
          고객 계정으로 로그인
        </LinkButton>
      </div>
    </div>
  );
}
