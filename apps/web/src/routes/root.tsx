import type { CurrentUser } from "@grabmarket/contracts";
import { redirect, useRevalidator, useRouteError } from "react-router";
import { callApi, isApiError } from "../api/client.ts";
import { NotFoundError } from "../lib/not-found.ts";
import { Logo } from "../components/site-header.tsx";
import { FailureState } from "../components/states.tsx";
import type { RootData } from "../state/root-data.ts";

async function loadCurrentUser(): Promise<CurrentUser | null> {
  try {
    return (await callApi("me")).user;
  } catch (error) {
    if (isApiError(error, "UNAUTHENTICATED")) return null;
    throw error;
  }
}

export async function rootLoader(): Promise<RootData> {
  const [{ categories }, user] = await Promise.all([callApi("listCategories"), loadCurrentUser()]);
  return { categories, user };
}

export async function logoutAction() {
  await callApi("logout");
  return redirect("/");
}

export function logoutLoader() {
  return redirect("/");
}

/** 첫 화면이 준비되는 동안(카테고리와 로그인 상태를 읽는 중) */
export function RootFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <p role="status" className="text-sm text-ink-3">
        불러오는 중
      </p>
    </div>
  );
}

/** 카테고리와 로그인 상태를 못 읽었거나 화면에서 예기치 못한 오류가 났을 때 */
export function RootError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const notFound = error instanceof NotFoundError;
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex max-w-360 items-center px-4 py-4 md:px-8">
        <Logo className="text-logo-m md:text-logo" />
      </div>
      {notFound ? (
        <FailureState title="페이지를 찾을 수 없어요" hint="주소를 다시 확인해 주세요" />
      ) : (
        <FailureState
          title="화면을 불러오지 못했어요"
          hint={isApiError(error) ? error.message : "잠시 뒤 다시 시도해 주세요"}
          onRetry={() => void revalidator.revalidate()}
          retrying={revalidator.state === "loading"}
        />
      )}
    </div>
  );
}
