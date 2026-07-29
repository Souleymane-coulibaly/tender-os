import type { ExtractedContent, ExtractedContentUnit, NormalizedExtractedContent } from "./extracted-content";

// Caracteres de controle C0 (hors \n = U+000A et \t = U+0009) + DEL (U+007F), exprimes en
// echappements Unicode explicites (jamais de caractere de controle litteral dans le code source).
// eslint-disable-next-line no-control-regex -- neutralisation intentionnelle des caractères de contrôle dans du texte extrait de documents tiers (même motif que filename-sanitizer.ts).
const CONTROL_CHARS_EXCEPT_NEWLINE_AND_TAB = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");
// Coupure de mot en fin de ligne PDF ("docu-\nment" -> "document") — heuristique volontairement
// prudente : seulement un tiret directement suivi d'un retour a la ligne puis d'une minuscule,
// jamais une vraie ponctuation de fin de phrase (mission Sprint 3 "normalisation" - cesures PDF).
const PDF_HYPHENATION = /-\n(?=[a-z])/g;

function normalizeUnitText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(PDF_HYPHENATION, "")
    .replace(CONTROL_CHARS_EXCEPT_NEWLINE_AND_TAB, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Ligne candidate a un en-tete/pied de page repete (mission Sprint 3 "normalisation") : courte,
 *  presente identique en premiere ou derniere ligne d'une majorite de pages. Retiree uniquement
 *  si detectee sur AU MOINS trois pages ET plus de la moitie des pages du document — jamais sur
 *  un document trop court, ou la coincidence est plus probable qu'une vraie repetition
 *  structurelle. */
function detectRepeatedHeaderFooterLines(units: readonly ExtractedContentUnit[]): ReadonlySet<string> {
  const pageUnits = units.filter((unit) => unit.kind === "page" && unit.text.trim().length > 0);
  if (pageUnits.length < 3) {
    return new Set();
  }

  const edgeLineCounts = new Map<string, number>();
  for (const unit of pageUnits) {
    const lines = unit.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const candidates = new Set([lines[0], lines[lines.length - 1]].filter((line): line is string => !!line));
    for (const line of candidates) {
      if (line.length === 0 || line.length > 120) continue;
      edgeLineCounts.set(line, (edgeLineCounts.get(line) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(pageUnits.length / 2);
  const repeated = new Set<string>();
  for (const [line, count] of edgeLineCounts) {
    if (count > threshold) {
      repeated.add(line);
    }
  }
  return repeated;
}

function stripRepeatedLines(text: string, repeated: ReadonlySet<string>): string {
  if (repeated.size === 0) {
    return text;
  }
  return text
    .split("\n")
    .filter((line) => !repeated.has(line.trim()))
    .join("\n")
    .trim();
}

/**
 * Normalisation (mission Sprint 3 - normalisation du texte) — opere uniquement sur
 * `ExtractedContent` (agnostique du format d'origine, voir extracted-content.ts). Conserve
 * toujours `kind`/`index`/`label` (tracabilite vers la source, numeros de page, noms de feuille,
 * titres de section) : seul `text` est modifie. Ne detruit jamais une unite entiere — une page
 * devenue vide apres nettoyage reste presente avec un texte vide, filtree seulement au moment de
 * la segmentation (mission "evite les chunks vides"), jamais ici.
 */
export function normalizeExtractedContent(content: ExtractedContent): NormalizedExtractedContent {
  const repeatedLines = detectRepeatedHeaderFooterLines(content.units);

  const units = content.units.map((unit) => {
    const normalized = normalizeUnitText(unit.text);
    const withoutRepeated = unit.kind === "page" ? stripRepeatedLines(normalized, repeatedLines) : normalized;
    return { ...unit, text: withoutRepeated };
  });

  return { ...content, units };
}
