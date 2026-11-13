import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-[1280px] p-4">
      <h1 className="text-lg font-bold">페이지를 찾을 수 없습니다.</h1>
      <Link to="/" className="mt-3 inline-block text-sm underline">
        홈으로 가기
      </Link>
    </main>
  );
}
