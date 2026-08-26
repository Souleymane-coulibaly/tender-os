import { describe, expect, it } from "vitest";
import { TechnicalMemoCitationSourceType } from "../../domain/enums";
import { TechnicalMemoCitationValidationFailedError } from "../../domain/errors";
import {
  QUOTABLE_CONTENT_MARKER,
  renderTechnicalMemoSourceLine,
  validateTechnicalMemoCitation,
  type KnownTechnicalMemoReference,
} from "./technical-memo-citation-validator";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-3 — F-10.
 *
 * INVARIANT VERROUILLÉ ICI : ce que le modèle a le droit de citer (le texte rendu après
 * `CITATION EXACTE :`) est EXACTEMENT ce que le garde de provenance sait vérifier (`content`).
 * Les deux moitiés du contrat sont testées ensemble — le rendu et la validation — pour qu'elles ne
 * puissent plus diverger.
 *
 * Le garde n'est pas assoupli : toute la série hostile ci-dessous doit rester rejetée.
 */
function ref(content: string, label = "Libellé descriptif"): KnownTechnicalMemoReference {
  return { sourceType: TechnicalMemoCitationSourceType.CandidateField, label, content, candidateFieldPath: "x" };
}
const known = (r: KnownTechnicalMemoReference, id = "CANDIDATE:x") => new Map([[id, r]]);

/** Extrait le texte réellement citable de la ligne rendue — reproduit ce que fait le modèle. */
function quotableRegionOf(line: string): string {
  const at = line.indexOf(QUOTABLE_CONTENT_MARKER);
  return line.slice(at + QUOTABLE_CONTENT_MARKER.length + 1);
}

describe("Contrat du contenu citable (F-10)", () => {
  describe("§9 — le rendu et la validation s'accordent", () => {
    const CASES: Array<[string, string]> = [
      ["contenu simple", "Nous appliquons la norme NF DTU 21."],
      ["deux-points dans le contenu", "Délai : douze mois à compter de la notification."],
      ["crochets dans le contenu", "Le lot [1] concerne le gros oeuvre."],
      ["espaces en tête et en fin", "   Contenu entouré d'espaces   "],
      ["contenu multiligne", "Première ligne.\nDeuxième ligne.\nTroisième ligne."],
      ["apostrophes françaises", "L'entreprise s'engage à l'exécution dans l'année."],
      ["unicode et accents", "Réf. n°4 — béton armé ≥ 350 kg/m³, coût 1 200 €"],
      ["contenu JSON machine", '{"legalName":"ALPHA CONSTRUCTION TNR-A","siren":"111111118"}'],
    ];

    for (const [name, content] of CASES) {
      it(`BLOQUANT — ${name} : la région citable rendue est acceptée verbatim`, () => {
        const line = renderTechnicalMemoSourceLine("CANDIDATE:x", ref(content));
        expect(quotableRegionOf(line)).toBe(content);
        expect(validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:x", excerpt: content }, known(ref(content))).content).toBe(content);
      });
    }

    it("BLOQUANT — le LIBELLÉ n'est jamais citable : métadonnée + extrait valide reste rejeté", () => {
      const content = "Nous appliquons la norme NF DTU 21.";
      const r = ref(content, "Identité légale de l'entreprise");

      expect(() =>
        validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:x", excerpt: `Identité légale de l'entreprise : ${content}` }, known(r)),
      ).toThrow(TechnicalMemoCitationValidationFailedError);
    });

    it("BLOQUANT — c'était le défaut exact de la TNR-2 : le préfixe de libellé collé au contenu", () => {
      const content = '{"legalName":"ALPHA CONSTRUCTION TNR-A"}';
      const r = ref(content, "Identité légale de l'entreprise");
      // Ce que le modèle produisait quand rien ne délimitait la région citable :
      expect(() => validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:x", excerpt: `Identité légale : ${content}` }, known(r))).toThrow();
      // Ce que le rendu canonique lui montre désormais, et qui passe :
      expect(quotableRegionOf(renderTechnicalMemoSourceLine("CANDIDATE:x", r))).toBe(content);
    });

    it("libellés identiques mais contenus différents : chaque source garde SON contenu", () => {
      const a = ref("Contenu de la source A", "Même libellé");
      const b = ref("Contenu de la source B", "Même libellé");
      const map = new Map([["CANDIDATE:a", a], ["CANDIDATE:b", b]]);

      expect(validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:a", excerpt: "Contenu de la source A" }, map).content).toBe(a.content);
      expect(() => validateTechnicalMemoCitation({ sourceRef: "CANDIDATE:a", excerpt: "Contenu de la source B" }, map)).toThrow();
    });
  });

  describe("§10 — série hostile : le garde reste strict", () => {
    const REAL = "Le titulaire assure la conformité NF DTU 21 sur l'ensemble du lot 1.";
    const OTHER = "Le délai global d'exécution est fixé à douze mois calendaires.";
    const map = new Map([["FIND:REQUIREMENT:1", ref(REAL)], ["FIND:REQUIREMENT:2", ref(OTHER)]]);

    const HOSTILE: Array<[string, string]> = [
      ["phrase entièrement fabriquée", "Le titulaire est certifié ISO 9001 depuis 2015."],
      ["préfixe fabriqué devant une phrase réelle", `Comme indiqué au CCTP, ${REAL}`],
      ["mutation partielle d'une phrase réelle", "Le titulaire assure la conformité NF DTU 22 sur l'ensemble du lot 1."],
      ["fusion de deux sources réelles", `${REAL} ${OTHER}`],
      ["reformulation plausible", "Le titulaire garantit le respect de la norme NF DTU 21 pour le lot 1."],
      ["casse modifiée", REAL.toUpperCase()],
      ["espaces internes écrasés", REAL.replace(/ /g, "  ")],
    ];

    for (const [name, excerpt] of HOSTILE) {
      it(`BLOQUANT — ${name} : REJETÉ`, () => {
        expect(() => validateTechnicalMemoCitation({ sourceRef: "FIND:REQUIREMENT:1", excerpt }, map)).toThrow(
          TechnicalMemoCitationValidationFailedError,
        );
      });
    }

    it("BLOQUANT — extrait réel mais attribué à la MAUVAISE source : REJETÉ", () => {
      expect(() => validateTechnicalMemoCitation({ sourceRef: "FIND:REQUIREMENT:2", excerpt: REAL }, map)).toThrow(
        TechnicalMemoCitationValidationFailedError,
      );
    });

    it("BLOQUANT — la sentinelle ISO-FAKE-98765 ne peut jamais être validée", () => {
      for (const excerpt of ["ISO-FAKE-98765", `${REAL} ISO-FAKE-98765`, "Certification ISO-FAKE-98765 obtenue en 2020"]) {
        expect(() => validateTechnicalMemoCitation({ sourceRef: "FIND:REQUIREMENT:1", excerpt }, map), excerpt).toThrow(
          TechnicalMemoCitationValidationFailedError,
        );
      }
    });

    it("BLOQUANT — un sourceRef existant ne suffit JAMAIS à valider un extrait faux", () => {
      expect(() => validateTechnicalMemoCitation({ sourceRef: "FIND:REQUIREMENT:1", excerpt: "n'importe quoi" }, map)).toThrow();
      // ... alors qu'une citation SANS extrait reste valide sur une source réelle.
      expect(validateTechnicalMemoCitation({ sourceRef: "FIND:REQUIREMENT:1" }, map).content).toBe(REAL);
    });
  });
});
