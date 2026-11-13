export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface NewSession {
  tokenHash: string;
  userId: number;
  createdAt: Date;
  expiresAt: Date;
}
