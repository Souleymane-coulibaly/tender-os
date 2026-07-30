import { z } from "zod";

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
