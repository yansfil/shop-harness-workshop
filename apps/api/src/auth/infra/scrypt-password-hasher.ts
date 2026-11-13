import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "../domain/ports.ts";

const KEY_LENGTH = 64;
const PREFIX = "scrypt";

/** 저장 형식: scrypt$<salt hex>$<hash hex>. 시드는 salt를 고정해 같은 해시를 만든다. */
export function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
  return `${PREFIX}$${salt.toString("hex")}$${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

const MISSING_USER_HASH = hashPassword("no-such-user", Buffer.alloc(16));

export class ScryptPasswordHasher implements PasswordHasher {
  verify(password: string, stored: string | null): boolean {
    const [prefix, saltHex, hashHex] = (stored ?? MISSING_USER_HASH).split("$");
    if (prefix !== PREFIX || saltHex === undefined || hashHex === undefined) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return stored !== null && timingSafeEqual(actual, expected);
  }
}
