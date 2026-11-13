import { LinkButton } from "../components/button.tsx";
import { EmptyState } from "../components/states.tsx";

export function NotFoundPage() {
  return (
    <EmptyState title="페이지를 찾을 수 없어요" hint="주소를 다시 확인해 주세요">
      <LinkButton to="/" size="lg">
        홈으로 가기
      </LinkButton>
    </EmptyState>
  );
}
