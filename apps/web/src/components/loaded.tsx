import { type ReactNode, Suspense } from "react";
import { Await, Navigate, useAsyncError, useLocation, useRevalidator } from "react-router";
import { isApiError } from "../api/client.ts";
import { loginPath } from "../lib/login-path.ts";
import { useRootData } from "../state/root-data.ts";
import { AdminCustomerOnlyScreen } from "./admin-order-notice.tsx";
import { ForbiddenScreen } from "./forbidden-screen.tsx";
import { FailureState } from "./states.tsx";

/**
 * 로더가 돌려준 약속(promise)을 기다리는 동안 skeleton을 보이고, 실패하면 다시 시도를 보인다.
 * 로그인이 필요한 요청이 401이면 로그인 화면으로 보낸다. 권한이 없으면(403) 관리자에게는 고객 계정 안내를,
 * 그 밖에는 권한 없음 화면을 보인다.
 */
export function Loaded<T>({
  resolve,
  skeleton,
  failure,
  notFound,
  children,
}: {
  resolve: Promise<T>;
  skeleton: ReactNode;
  failure: string;
  /** 없는 대상(404)일 때 보일 화면. 없으면 일반 실패로 다룬다. */
  notFound?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  return (
    <Suspense fallback={skeleton}>
      <Await resolve={resolve} errorElement={<LoadFailure title={failure} notFound={notFound} />}>
        {children}
      </Await>
    </Suspense>
  );
}

function LoadFailure({ title, notFound }: { title: string; notFound: ReactNode }) {
  const error = useAsyncError();
  const location = useLocation();
  const revalidator = useRevalidator();
  const { user } = useRootData();
  const here = location.pathname + location.search;

  if (isApiError(error, "UNAUTHENTICATED")) {
    return <Navigate to={loginPath(here)} replace />;
  }
  if (isApiError(error, "FORBIDDEN")) return user?.role === "admin" ? <AdminCustomerOnlyScreen next={here} /> : <ForbiddenScreen />;
  if (notFound !== undefined && isApiError(error, "NOT_FOUND")) return notFound;

  return (
    <FailureState
      title={title}
      hint={isApiError(error) ? error.message : undefined}
      onRetry={() => void revalidator.revalidate()}
      retrying={revalidator.state === "loading"}
    />
  );
}
