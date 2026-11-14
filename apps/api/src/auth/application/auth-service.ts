import type { Clock } from "@grabmarket/shared";
import { DomainError } from "../../shared/domain/domain-error.ts";
import type { SessionUser } from "../../shared/domain/session-user.ts";
import type { PasswordHasher, SessionRepository, SessionTokens, UserRepository } from "../domain/ports.ts";
import { SESSION_TTL_MS } from "../domain/session.ts";

export interface LoginResult {
  token: string;
  user: SessionUser;
}

export class AuthService {
  readonly #users: UserRepository;
  readonly #sessions: SessionRepository;
  readonly #hasher: PasswordHasher;
  readonly #tokens: SessionTokens;
  readonly #clock: Clock;

  constructor(users: UserRepository, sessions: SessionRepository, hasher: PasswordHasher, tokens: SessionTokens, clock: Clock) {
    this.#users = users;
    this.#sessions = sessions;
    this.#hasher = hasher;
    this.#tokens = tokens;
    this.#clock = clock;
  }

  login(email: string, password: string): LoginResult {
    const record = this.#users.findByEmail(email.toLowerCase());
    const verified = this.#hasher.verify(password, record?.passwordHash ?? null);
    if (record === undefined || !verified) {
      throw new DomainError("INVALID_CREDENTIALS", "이메일이나 비밀번호가 올바르지 않습니다.");
    }
    const now = this.#clock.now();
    const token = this.#tokens.generate();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    this.#sessions.deleteExpired(now);
    this.#sessions.insert({ tokenHash: this.#tokens.hash(token), userId: record.user.id, createdAt: now, expiresAt });
    return { token, user: record.user };
  }

  /** 쿠키 토큰으로 사용자를 찾는다. 없거나 끝난 세션이면 undefined. */
  authenticate(token: string | undefined): SessionUser | undefined {
    if (token === undefined || token === "") return undefined;
    return this.#sessions.findActiveUser(this.#tokens.hash(token), this.#clock.now());
  }

  logout(token: string | undefined): void {
    if (token === undefined || token === "") return;
    this.#sessions.delete(this.#tokens.hash(token));
  }
}
