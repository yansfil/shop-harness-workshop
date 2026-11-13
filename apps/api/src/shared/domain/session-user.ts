export type UserRole = "customer" | "admin";

/** 로그인한 사용자. 세션에서 읽어 요청마다 붙는다. 고객 ID는 이 값에서만 얻는다. */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
}
