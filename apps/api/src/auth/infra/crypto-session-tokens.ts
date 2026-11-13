import { createHash, randomBytes } from "node:crypto";
import type { SessionTokens } from "../domain/ports.ts";

export class CryptoSessionTokens implements SessionTokens {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
