import { LinkButton } from "./button.tsx";

/** 고객 계정이 관리자 화면에 들어왔을 때(A5). */
export function ForbiddenScreen() {
  return (
    <div className="mx-auto flex max-w-360 flex-col items-center gap-2 px-4 py-24 text-center">
      <span className="rounded-sm bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">권한 없음</span>
      <h1 className="mt-2 text-3xl font-extrabold text-ink">이 화면은 관리자만 볼 수 있어요</h1>
      <p className="text-base text-ink-2">
        지금은 고객 계정으로 로그인되어 있어요.
        <br />
        주문한 내용은 내 주문에서 볼 수 있어요.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton to="/orders" variant="secondary" size="lg">
          내 주문 보기
        </LinkButton>
        <LinkButton to="/" size="lg">
          쇼핑 계속하기
        </LinkButton>
      </div>
    </div>
  );
}
