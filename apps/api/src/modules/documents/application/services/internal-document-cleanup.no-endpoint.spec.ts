import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde architecturale (mission P1-1 bis) — `InternalDocumentCleanupService` est un mécanisme de
 * nettoyage technique interne, jamais un endpoint public. Ce test échoue si un jour un contrôleur
 * HTTP en vient à dépendre de ce service (signe qu'il aurait été exposé, même indirectement).
 */
describe("InternalDocumentCleanupService — never wired into an HTTP controller", () => {
  const controllerFiles = [
    "../../interfaces/http/documents.controller.ts",
    "../../interfaces/http/tender-documents.controller.ts",
    "../../../dce/interfaces/http/dce.controller.ts",
  ];

  it.each(controllerFiles)("%s does not reference InternalDocumentCleanupService", (relativePath) => {
    const absolutePath = join(__dirname, relativePath);
    const content = readFileSync(absolutePath, "utf8");

    expect(content).not.toMatch(/InternalDocumentCleanupService/);
  });
});
