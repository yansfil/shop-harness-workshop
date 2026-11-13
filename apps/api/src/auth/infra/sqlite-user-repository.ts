import type { Database } from "@grabmarket/db";
import { selectAll } from "../../shared/infra/rows.ts";
import type { UserRecord, UserRepository } from "../domain/ports.ts";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
  password_hash: string | null;
  phone: string | null;
  address: string | null;
}

export class SqliteUserRepository implements UserRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  findByEmail(email: string): UserRecord | undefined {
    const row = selectAll<UserRow>(
      this.#db,
      "SELECT id, email, name, role, password_hash, phone, address FROM users WHERE email = ?",
      email,
    )[0];
    if (row === undefined) return undefined;
    return {
      user: { id: row.id, email: row.email, name: row.name, role: row.role, phone: row.phone, address: row.address },
      passwordHash: row.password_hash,
    };
  }
}
