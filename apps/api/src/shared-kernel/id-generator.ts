import { randomUUID } from "node:crypto";

/**
 * Génération d'identifiants (Shared Kernel minimal — skills/platform-foundation/ARCHITECTURE_RULES.md §36).
 */
export interface IdGenerator {
  generate(): string;
}

export const ID_GENERATOR = Symbol("ID_GENERATOR");

export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
