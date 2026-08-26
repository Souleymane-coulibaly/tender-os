import { describe, expect, it } from "vitest";
import { TechnicalMemoCitationSourceType } from "../../domain/enums";
import { TechnicalMemoCitationValidationFailedError } from "../../domain/errors";
import { validateTechnicalMemoCitation, type KnownTechnicalMemoReference } from "./technical-memo-citation-validator";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 — F-08.
 *
 * L'assembleur affiche les sources entre crochets (`- [CANDIDATE:legalIdentity] ...`) mais les
 * enregistre sans. Le modèle recopiait la forme affichée et la citation d'une source RÉELLE était
 * rejetée. Ces tests verrouillent les deux moitiés du contrat : la forme affichée est acceptée, et
 * la garantie anti-fabrication reste entière.
 */
const KNOWN: ReadonlyMap<string, KnownTechnicalMemoReference> = new Map([
  [
    "CANDIDATE:legalIdentity",
    { sourceType: TechnicalMemoCitationSourceType.CandidateField, label: "Identité", content: "ALPHA CONSTRUCTION TNR-A, SAS au capital de 50 000 EUR", candidateFieldPath: "legalIdentity" },
  ],
]);

describe("Résolution du jeton de source d'une citation (F-08)", () => {
  it("BLOQUANT — la forme AFFICHÉE dans le prompt, entre crochets, est acceptée", () => {
    const match = validateTechnicalMemoCitation({ sourceRef: "[CANDIDATE:legalIdentity]" }, KNOWN);

    expect(match.candidateFieldPath).toBe("legalIdentity");
  });

  it("la forme brute, sans crochets, reste acceptée — le contrat d'origine est préservé", () => {
    expect(validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:legalIdentity" }, KNOWN).label).toBe("Identité");
  });

  it("BLOQUANT — une source INEXISTANTE reste rejetée, avec ou sans crochets", () => {
    for (const sourceRef of ["CANDIDATE:inventee", "[CANDIDATE:inventee]", "[DOC:00000000:9]"]) {
      expect(() => validateTechnicalMemoCitation({ sourceRef }, KNOWN), sourceRef).toThrow(TechnicalMemoCitationValidationFailedError);
    }
  });

  it("BLOQUANT — aucun rapprochement approximatif n'est introduit : casse et espaces restent stricts", () => {
    for (const sourceRef of ["candidate:legalidentity", "[ CANDIDATE:legalIdentity ]", "[[CANDIDATE:legalIdentity]]", "CANDIDATE:legal Identity"]) {
      expect(() => validateTechnicalMemoCitation({ sourceRef }, KNOWN), sourceRef).toThrow(TechnicalMemoCitationValidationFailedError);
    }
  });

  it("BLOQUANT — un extrait absent du contenu réel reste rejeté, même sur une source valide", () => {
    expect(() =>
      validateTechnicalMemoCitation({ sourceRef: "[CANDIDATE:legalIdentity]", excerpt: "SARL au capital de 1 EUR" }, KNOWN),
    ).toThrow(TechnicalMemoCitationValidationFailedError);
  });

  it("un extrait réellement présent est accepté sur la forme entre crochets", () => {
    expect(validateTechnicalMemoCitation({ sourceRef: "[CANDIDATE:legalIdentity]", excerpt: "ALPHA CONSTRUCTION TNR-A" }, KNOWN).content).toContain("ALPHA");
  });
});
