import { z } from "zod";
import { IdSchema } from "./common.ts";

/** HttpOnly 세션 쿠키 이름. 쿠키 값은 서버만 읽는다. */
export const SESSION_COOKIE_NAME = "grabmarket_session";

export const UserRoleSchema = z.enum(["customer", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const LoginRequestSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CurrentUserSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  /** 주문서의 기본 배송지. 관리자는 null이다. */
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

/** POST /api/auth/login 200(쿠키 설정), GET /api/auth/me 200. 로그인 전이면 me는 401 UNAUTHENTICATED. */
export const MeResponseSchema = z.object({ user: CurrentUserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// POST /api/auth/logout: 본문 없음, 204. 세션을 지우고 쿠키를 만료시킨다. 로그인 전이어도 204.

/** 로그인 화면에 적어 두는 교육용 계정. 시드(db:reset)가 이 값으로 계정을 만든다. */
export const DEMO_ACCOUNTS = [
  { role: "customer", label: "고객 1", name: "김하늘", email: "customer1@grabmarket.test", password: "grab1234!" },
  { role: "customer", label: "고객 2", name: "이도윤", email: "customer2@grabmarket.test", password: "grab1234!" },
  { role: "admin", label: "관리자", name: "그랩마켓 운영자", email: "admin@grabmarket.test", password: "admin1234!" },
] as const satisfies readonly { role: UserRole; label: string; name: string; email: string; password: string }[];
