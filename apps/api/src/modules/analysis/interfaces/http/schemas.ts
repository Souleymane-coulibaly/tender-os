import { z } from "zod";
import { ComplexityLevel } from "../../domain/business/complexity-level";

export const IdParamSchema = z.string().uuid();

/** Mission Sprint 4.2 §"API HTTP minimale" — pagination volontairement simple (offset/limit,
 *  jamais un curseur) pour les listes de findings ; `analysisVersion` optionnel permet de
 *  consulter explicitement une version passée de l'historique, sinon la plus récente consolidation
 *  réussie est résolue automatiquement (voir `resolveLatestAnalysisVersion`). */
export const BusinessAnalysisListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    offset: z.coerce.number().int().min(0).optional().default(0),
    analysisVersion: z.coerce.number().int().min(1).optional(),
  })
  .strict();
export type BusinessAnalysisListQuery = z.infer<typeof BusinessAnalysisListQuerySchema>;

/** V2 Sprint 4 §9-12 — `analysisVersion` optionnel permet de mapper explicitement une version
 *  passée de l'historique, sinon la plus récente consolidation réussie est résolue automatiquement
 *  (même convention que `BusinessAnalysisListQuerySchema`). */
export const MapSuggestionsQuerySchema = z
  .object({
    analysisVersion: z.coerce.number().int().min(1).optional(),
  })
  .strict();
export type MapSuggestionsQuery = z.infer<typeof MapSuggestionsQuerySchema>;

const COMPLEXITY_LEVEL_VALUES = Object.values(ComplexityLevel) as [ComplexityLevel, ...ComplexityLevel[]];

/** V2 Sprint 4 — révision utilisateur de la synthèse IA : chaque champ est optionnel (non fourni =
 *  "je ne corrige pas ce champ", jamais une valeur par défaut fabriquée), mais AU MOINS un champ de
 *  contenu doit être fourni (`.refine`) — jamais une révision vide qui ne corrigerait rien. */
export const ReviseTenderAnalysisSummaryBodySchema = z
  .object({
    opportunitySummary: z.string().trim().min(1).max(4000).optional(),
    complexityLevel: z.enum(COMPLEXITY_LEVEL_VALUES).optional(),
    mainCriteria: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    mainRisks: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    mainObligations: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    missingElements: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    pointsToClarify: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    conflicts: z.unknown().optional(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.opportunitySummary !== undefined ||
      value.complexityLevel !== undefined ||
      value.mainCriteria !== undefined ||
      value.mainRisks !== undefined ||
      value.mainObligations !== undefined ||
      value.missingElements !== undefined ||
      value.pointsToClarify !== undefined ||
      value.conflicts !== undefined,
    { message: "Au moins un champ de contenu doit être corrigé." },
  );
export type ReviseTenderAnalysisSummaryBody = z.infer<typeof ReviseTenderAnalysisSummaryBodySchema>;
