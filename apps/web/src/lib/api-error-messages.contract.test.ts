// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { API_ERROR_MESSAGES } from "./api-error-messages";

/**
 * Contrat entre l'API et l'écran : chaque code d'erreur que l'API peut renvoyer a un message
 * français. Ce test lit les SOURCES de l'API plutôt qu'une liste recopiée — une liste recopiée
 * vieillirait en silence, exactement le défaut qu'il doit empêcher.
 */
const API_SRC = fileURLToPath(new URL("../../../api/src", import.meta.url));

/** Codes émis hors des erreurs de domaine (filtre global, gardes) — voir `global-exception.filter.ts`. */
const FRAMEWORK_CODES = ["AUTHENTICATION_REQUIRED", "FORBIDDEN", "INTERNAL_SERVER_ERROR", "ORGANIZATION_ACCESS_DENIED", "ORGANIZATION_ID_HEADER_REQUIRED", "VALIDATION_FAILED"];

/** Exceptions HTTP génériques : le filtre global leur donne pour code le nom du statut. */
const GENERIC_HTTP_CODES = ["TOO_MANY_REQUESTS", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE"];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "test-support") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) files.push(path);
  }
  return files;
}

function domainErrorCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(/readonly code = "([A-Z0-9_]+)"/g)) {
      codes.add(match[1]!);
    }
  }
  return codes;
}

describe("contrat API ↔ écran : chaque erreur a un message français", () => {
  const apiCodes = domainErrorCodes();

  it("la lecture des sources de l'API trouve bien les codes (garde-fou du test lui-même)", () => {
    expect(apiCodes.size).toBeGreaterThan(400);
  });

  it("aucun code d'erreur de domaine n'arrive à l'écran sans traduction", () => {
    const missing = [...apiCodes].filter((code) => !(code in API_ERROR_MESSAGES)).sort();
    expect(missing, "codes à traduire dans lib/api-error-messages.ts").toEqual([]);
  });

  it("les codes du filtre global, des gardes et des exceptions HTTP génériques sont traduits", () => {
    const missing = [...FRAMEWORK_CODES, ...GENERIC_HTTP_CODES].filter((code) => !(code in API_ERROR_MESSAGES));
    expect(missing).toEqual([]);
  });

  it("aucune traduction ne survit à un code supprimé de l'API", () => {
    const known = new Set([...apiCodes, ...FRAMEWORK_CODES, ...GENERIC_HTTP_CODES]);
    const stale = Object.keys(API_ERROR_MESSAGES).filter((code) => !known.has(code)).sort();
    expect(stale, "traductions obsolètes à retirer").toEqual([]);
  });

  it("aucun message ne laisse passer une interpolation, un code technique ou un statut brut", () => {
    const leaks = Object.entries(API_ERROR_MESSAGES)
      .filter(([, message]) => /\$\{|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b(DRAFT|VALIDATED|GENERATED|PENDING|FAILED|READY_FOR_REVIEW)\b/.test(message))
      .map(([code]) => code);
    expect(leaks).toEqual([]);
  });
});
