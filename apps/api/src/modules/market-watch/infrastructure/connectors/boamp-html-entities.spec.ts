import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./boamp-source-connector";

/**
 * Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-004) — contrat de normalisation des entites HTML
 * livrees par BOAMP. La sortie doit rester du TEXTE : c'est l'interface qui echappe a l'affichage,
 * jamais ce decodeur qui produirait du HTML.
 */
describe("decodeHtmlEntities — normalisation BOAMP (REC-004)", () => {
  it("BLOQUANT — decode le cas reellement observe en production", () => {
    expect(decodeHtmlEntities("Ville d&#039;Arcueil")).toBe("Ville d'Arcueil");
  });

  it("decode les cinq entites nommees de base", () => {
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
    expect(decodeHtmlEntities("&lt;balise&gt;")).toBe("<balise>");
    expect(decodeHtmlEntities("&quot;cite&quot;")).toBe('"cite"');
    expect(decodeHtmlEntities("l&apos;essai")).toBe("l'essai");
  });

  it("decode les references numeriques decimales et hexadecimales", () => {
    expect(decodeHtmlEntities("caf&#233;")).toBe("café");
    expect(decodeHtmlEntities("caf&#xE9;")).toBe("café");
  });

  it("BLOQUANT — ne decode JAMAIS deux fois : `&amp;#039;` reste `&#039;`", () => {
    // Un decodage recursif permettrait de reconstituer des sequences non voulues a partir d'une
    // entree doublement encodee. Un seul passage, toujours.
    expect(decodeHtmlEntities("&amp;#039;")).toBe("&#039;");
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("laisse intacte une entite inconnue plutot que d'inventer un caractere", () => {
    expect(decodeHtmlEntities("&inconnue; &#0; &#999999999;")).toBe("&inconnue; &#0; &#999999999;");
  });

  it("est neutre sur un texte sans entite (idempotence)", () => {
    const clean = "Marché de travaux — Ville d'Arcueil (95)";
    expect(decodeHtmlEntities(clean)).toBe(clean);
    expect(decodeHtmlEntities(decodeHtmlEntities(clean))).toBe(clean);
  });
});
