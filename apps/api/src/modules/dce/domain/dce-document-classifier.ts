import { DceDocumentCategory } from "./dce-document-category";

/**
 * Classification déterministe (mission architecture §7) — nom de fichier, extension et
 * mots-clés usuels d'un dossier de consultation français uniquement, jamais de contenu binaire
 * ni d'appel IA (ce sprint prépare la classification, il ne la fait pas analyser par un
 * fournisseur externe). Volontairement remplaçable : un futur sprint IA pourrait substituer une
 * autre implémentation à cette seule fonction, sans toucher `DceDocumentCategory` ni les appelants.
 *
 * Ordre de priorité : financier > technique > administratif > image (probable plan/scan) > OTHER
 * — les jeux de mots-clés ne se recoupent jamais dans les sigles usuels d'un DCE français, l'ordre
 * ne sert qu'à trancher les cas ambigus au profit du signal le plus spécifique.
 */
const FINANCIAL_KEYWORDS = new Set(["bpu", "dpgf", "dqe", "devis", "prix", "financier", "bordereau"]);
const TECHNICAL_KEYWORDS = new Set(["cctp", "technique", "specifications", "specification"]);
const ADMINISTRATIVE_KEYWORDS = new Set([
  "rc",
  "ccap",
  "aapc",
  "dc1",
  "dc2",
  "dc3",
  "dc4",
  "reglement",
  "consultation",
  "acte",
  "engagement",
  "avis",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);

// Marques diacritiques combinantes (U+0300-U+036F) laissées par la décomposition NFD — retirées
// pour que "reglement"/"règlement" ou "specifications"/"spécifications" tokenisent identiquement.
const COMBINING_DIACRITICAL_MARKS = /[̀-ͯ]/g;

function tokenize(filename: string): string[] {
  const withoutExtension = filename.replace(/\.[a-zA-Z0-9]+$/, "");
  return withoutExtension
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

export function classifyDceDocument(input: { filename: string; extension: string }): DceDocumentCategory {
  const tokens = tokenize(input.filename);
  const normalizedExtension = input.extension.toLowerCase().replace(/^\./, "");

  if (tokens.some((token) => FINANCIAL_KEYWORDS.has(token))) {
    return DceDocumentCategory.Financial;
  }
  if (tokens.some((token) => TECHNICAL_KEYWORDS.has(token))) {
    return DceDocumentCategory.Technical;
  }
  if (tokens.some((token) => ADMINISTRATIVE_KEYWORDS.has(token))) {
    return DceDocumentCategory.Administrative;
  }
  if (IMAGE_EXTENSIONS.has(normalizedExtension)) {
    return DceDocumentCategory.Drawings;
  }
  return DceDocumentCategory.Other;
}
