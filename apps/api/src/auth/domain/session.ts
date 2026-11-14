/** 로그인은 로그아웃하지 않으면 12시간 유지된다(강의 하루 내내). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface NewSession {
  tokenHash: string;
  userId: number;
  createdAt: Date;
  expiresAt: Date;
}
