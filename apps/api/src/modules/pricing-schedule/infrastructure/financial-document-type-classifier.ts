import { FinancialDocumentType } from "../domain/enums";

/**
 * Classification déterministe BPU/DPGF/DQE (mission §5) — affine la catégorie grossière `FINANCIAL`
 * déjà produite par `classifyDceDocument` (module `dce`), qui ne distingue pas ces 3 types entre
 * eux. Jamais un second classifieur DCE générique : cette fonction n'est appelée QUE sur des
 * documents déjà catégorisés `FINANCIAL`, elle ne réévalue jamais administratif/technique/dessin.
 * Règles déterministes uniquement (nom de fichier) — un futur complément IA resterait une
 * PROPOSITION distincte quand ce classifieur ne tranche pas, jamais une classification silencieuse.
 */
const DQE_KEYWORDS = new Set(["dqe", "quantitatif", "quantitatifestimatif", "decompositionquantitative"]);
const DPGF_KEYWORDS = new Set(["dpgf", "decompositionprixglobal", "decompositionduprixglobaletforfaitaire"]);
const BPU_KEYWORDS = new Set(["bpu", "bordereau", "bordereaudesprixunitaires", "prixunitaire", "prixunitaires"]);

// Marques diacritiques combinantes (U+0300-U+036F) laissées par la décomposition NFD — même motif
// que `dce-document-classifier.ts` : "décomposition"/"decomposition" tokenisent identiquement.
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

/** Retourne toujours une valeur (jamais `undefined`) — un document déjà catégorisé `FINANCIAL` mais
 *  dont le nom ne permet pas de trancher entre BPU/DPGF/DQE devient `OTHER_FINANCIAL_SCHEDULE`,
 *  jamais ignoré ni classé au hasard dans l'un des trois types précis. */
export function classifyFinancialDocumentType(input: { filename: string }): FinancialDocumentType {
  const tokens = tokenize(input.filename);

  if (tokens.some((token) => DQE_KEYWORDS.has(token))) {
    return FinancialDocumentType.Dqe;
  }
  if (tokens.some((token) => DPGF_KEYWORDS.has(token))) {
    return FinancialDocumentType.Dpgf;
  }
  if (tokens.some((token) => BPU_KEYWORDS.has(token))) {
    return FinancialDocumentType.Bpu;
  }
  return FinancialDocumentType.OtherFinancialSchedule;
}
