import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "../application/ports/password-hasher";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH_BYTES = 16;

/**
 * Hash de mot de passe via `node:crypto` (scrypt) — aucune dépendance native
 * supplémentaire (cohérent avec le principe "boring technology" de
 * skills/platform-foundation/ARCHITECTURE_RULES.md §40). Remplaçable sans impact sur
 * l'Application ou le Domain grâce au port PasswordHasher.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH_BYTES).toString("hex");
    const derivedKey = (await scrypt(plainPassword, salt, KEY_LENGTH)) as Buffer;

    return `${salt}:${derivedKey.toString("hex")}`;
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    const [salt, storedKeyHex] = passwordHash.split(":");

    if (!salt || !storedKeyHex) {
      return false;
    }

    const storedKey = Buffer.from(storedKeyHex, "hex");
    const derivedKey = (await scrypt(plainPassword, salt, KEY_LENGTH)) as Buffer;

    if (derivedKey.length !== storedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, storedKey);
  }
}
