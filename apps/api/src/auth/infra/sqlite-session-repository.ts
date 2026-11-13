import type { Database } from "@grabmarket/db";
import type { SessionUser } from "../../shared/domain/session-user.ts";
import { selectAll } from "../../shared/infra/rows.ts";
import type { SessionRepository } from "../domain/ports.ts";
import type { NewSession } from "../domain/session.ts";

interface SessionUserRow {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
  phone: string | null;
  address: string | null;
}

export class SqliteSessionRepository implements SessionRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  insert(session: NewSession): void {
    this.#db
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(session.tokenHash, session.userId, session.createdAt.toISOString(), session.expiresAt.toISOString());
  }

  findActiveUser(tokenHash: string, now: Date): SessionUser | undefined {
    const row = selectAll<SessionUserRow>(
      this.#db,
      `SELECT u.id, u.email, u.name, u.role, u.phone, u.address
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      now.toISOString(),
    )[0];
    return row === undefined ? undefined : { id: row.id, email: row.email, name: row.name, role: row.role, phone: row.phone, address: row.address };
  }

  delete(tokenHash: string): void {
    this.#db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpired(now: Date): void {
    this.#db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  }
}
