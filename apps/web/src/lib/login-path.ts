/** 로그인 화면 주소. 로그인하면 next로 돌아온다. 같은 사이트 안의 경로만 받는다. */
export function loginPath(next: string): string {
  return isLocalPath(next) && next !== "/login" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

export function isLocalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/** 로그인 뒤 돌아갈 곳. 형식이 이상하면 홈. */
export function safeNext(next: string | null): string {
  return next !== null && isLocalPath(next) ? next : "/";
}
