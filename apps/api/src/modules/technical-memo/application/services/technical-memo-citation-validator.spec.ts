import { describe, expect, it } from "vitest";
import { TechnicalMemoCitationSourceType } from "../../domain/enums";
import { TechnicalMemoCitationValidationFailedError } from "../../domain/errors";
import { validateTechnicalMemoCitation, validateTechnicalMemoCitations, type KnownTechnicalMemoReferences } from "./technical-memo-citation-validator";

function knownReferences(): KnownTechnicalMemoReferences {
  return new Map([
    ["FIND:REQUIREMENT:req-1", { sourceType: TechnicalMemoCitationSourceType.Finding, label: "Exigence 1", content: "Le candidat doit fournir une attestation d'assurance." }],
    ["KB:kb-1", { sourceType: TechnicalMemoCitationSourceType.KnowledgeEntry, label: "Méthodologie standard", content: "Notre méthodologie repose sur une approche agile en 4 phases." }],
  ]);
}

describe("validateTechnicalMemoCitation", () => {
  it("retourne la référence connue pour un sourceRef réellement fourni au contexte", () => {
    const match = validateTechnicalMemoCitation({ sourceRef: "KB:kb-1" }, knownReferences());
    expect(match.label).toBe("Méthodologie standard");
  });

  it("BLOQUANT — rejette un sourceRef inventé, jamais présent dans le contexte réellement fourni (mission §35)", () => {
    expect(() => validateTechnicalMemoCitation({ sourceRef: "KB:kb-999-inventé" }, knownReferences())).toThrow(TechnicalMemoCitationValidationFailedError);
  });

  it("BLOQUANT — rejette un extrait qui ne se retrouve pas mot pour mot dans le contenu connu (jamais une citation approximative)", () => {
    expect(() => validateTechnicalMemoCitation({ sourceRef: "KB:kb-1", excerpt: "un texte qui n'existe pas dans la source" }, knownReferences())).toThrow(TechnicalMemoCitationValidationFailedError);
  });

  it("accepte un extrait retrouvé mot pour mot dans le contenu connu", () => {
    expect(() => validateTechnicalMemoCitation({ sourceRef: "KB:kb-1", excerpt: "approche agile en 4 phases" }, knownReferences())).not.toThrow();
  });
});

describe("validateTechnicalMemoCitations", () => {
  it("BLOQUANT — une seule citation invalide fait échouer TOUT le lot, jamais une persistance partielle", () => {
    expect(() =>
      validateTechnicalMemoCitations([{ sourceRef: "FIND:REQUIREMENT:req-1" }, { sourceRef: "KB:kb-inventé" }], knownReferences()),
    ).toThrow(TechnicalMemoCitationValidationFailedError);
  });

  it("valide plusieurs citations réelles en une fois, dans l'ordre fourni", () => {
    const results = validateTechnicalMemoCitations([{ sourceRef: "KB:kb-1" }, { sourceRef: "FIND:REQUIREMENT:req-1" }], knownReferences());
    expect(results.map((r) => r.label)).toEqual(["Méthodologie standard", "Exigence 1"]);
  });
});
