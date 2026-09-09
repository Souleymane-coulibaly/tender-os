import { describe, expect, it } from "vitest";
import { buildOfficialCompanyName } from "./official-company-name";

/**
 * Checkpoint TENDEROS-2.1-H.6 — sémantique du champ officiel « nom commercial et dénomination
 * sociale », qui ferme `DEFERRED-G-03`.
 *
 * Les sentinelles sont volontairement DISTINCTES les unes des autres : une valeur unique partagée
 * rendrait indétectable la substitution même que ce checkpoint cherche à interdire.
 */
describe("H.6 — champ officiel « nom commercial et dénomination sociale »", () => {
  const LEGAL = "CANDIDATE-LEGAL-SA";
  const TRADE = "CANDIDATE-TRADE";

  it("émet la dénomination sociale EN PREMIER, le nom commercial en précision", () => {
    const value = buildOfficialCompanyName({ legalOrDisplayName: LEGAL, tradeName: TRADE });

    expect(value).toBe(`${LEGAL} (${TRADE})`);
    // L'ordre est un fait de lecture, pas une préférence de style : la première chose lue doit être
    // l'identité juridique du soumissionnaire.
    expect(value!.indexOf(LEGAL)).toBeLessThan(value!.indexOf(TRADE));
  });

  it("§17 — sans nom commercial, la valeur est exactement la dénomination sociale", () => {
    expect(buildOfficialCompanyName({ legalOrDisplayName: LEGAL, tradeName: undefined })).toBe(LEGAL);
    expect(buildOfficialCompanyName({ legalOrDisplayName: LEGAL, tradeName: "   " })).toBe(LEGAL);
  });

  it("un nom commercial identique à la dénomination sociale n'est pas répété", () => {
    expect(buildOfficialCompanyName({ legalOrDisplayName: LEGAL, tradeName: LEGAL })).toBe(LEGAL);
    expect(buildOfficialCompanyName({ legalOrDisplayName: LEGAL, tradeName: "candidate-legal-sa" })).toBe(LEGAL);
  });

  it("§9 — le nom commercial n'est JAMAIS émis seul, même s'il est le seul renseigné", () => {
    // Sans identité juridique on n'invente rien : le champ reste vide et sera signalé manquant.
    // Émettre « CANDIDATE-TRADE » seul aurait produit un formulaire officiel désignant une identité
    // qui n'est pas celle de la personne morale candidate.
    expect(buildOfficialCompanyName({ legalOrDisplayName: undefined, tradeName: TRADE })).toBeUndefined();
    expect(buildOfficialCompanyName({ legalOrDisplayName: "  ", tradeName: TRADE })).toBeUndefined();
  });

  it("§16 — le repli sur `name` est délibéré : le résolveur fournit `legalName ?? name`", () => {
    // Cette fonction reçoit déjà le résultat du repli. Ce test fige donc la conséquence attendue :
    // un candidat sans dénomination sociale déclarée voit son nom d'usage porté au formulaire,
    // jamais son nom commercial.
    const value = buildOfficialCompanyName({ legalOrDisplayName: "CANDIDATE-DISPLAY", tradeName: TRADE });
    expect(value).toBe(`CANDIDATE-DISPLAY (${TRADE})`);
    expect(value).not.toBe(TRADE);
  });
});
