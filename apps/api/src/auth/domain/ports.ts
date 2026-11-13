import type { SessionUser } from "../../shared/domain/session-user.ts";
import type { NewSession } from "./session.ts";

export interface UserRecord {
  user: SessionUser;
  /** 주문만 가진 고객은 비밀번호가 없다. */
  passwordHash: string | null;
}

export interface UserRepository {
  findByEmail(email: string): UserRecord | undefined;
}

export interface SessionRepository {
  insert(session: NewSession): void;
  /** 아직 끝나지 않은 세션의 사용자 */
  findActiveUser(tokenHash: string, now: Date): SessionUser | undefined;
  delete(tokenHash: string): void;
  deleteExpired(now: Date): void;
}

export interface PasswordHasher {
  /** stored가 없으면 항상 false. 사용자가 있든 없든 걸리는 시간은 같게 한다. */
  verify(password: string, stored: string | null): boolean;
}

export interface SessionTokens {
  generate(): string;
  /** 저장용 해시. 쿠키의 원래 토큰은 저장하지 않는다. */
  hash(token: string): string;
}
