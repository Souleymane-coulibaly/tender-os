import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import type { BusinessAnalysisRepository, PageResult } from "../ports/business-analysis.repository";
import { resolveLatestAnalysisVersion } from "../services/resolve-latest-analysis-version";

export type ListTenderFindingsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  analysisVersion?: number | undefined;
  limit: number;
  offset: number;
}>;

export type FindingsPageResult<T> = Readonly<{
  items: readonly T[];
  total: number;
  limit: number;
  offset: number;
  /** `undefined` uniquement si aucune consolidation n'a encore jamais réussi pour ce tender —
   *  `items` est alors une liste vide, jamais une erreur (mission §"gérer l'absence de résultat
   *  sans faire échouer toute la consultation"). */
  analysisVersion?: number | undefined;
}>;

/**
 * Logique partagée des 5 listes de findings Tender (deadlines/criteria/requirements/risks/
 * questions, mission Sprint 4.2 §"API HTTP minimale") — factorisée ici pour ne jamais dupliquer
 * l'autorisation, la vérification tenant/tender, et la résolution de version entre les 5 use cases
 * fins qui l'appellent (un par ressource HTTP, voir `list-tender-deadlines.use-case.ts` etc.).
 */
export async function executeListTenderFindings<T>(deps: {
  getTenderUseCase: GetTenderUseCase;
  businessAnalysisRepository: BusinessAnalysisRepository;
  query: ListTenderFindingsQuery;
  list: (input: { organizationId: string; tenderId: string; analysisVersion: number; limit: number; offset: number }) => Promise<PageResult<T>>;
}): Promise<FindingsPageResult<T>> {
  assertHasAnalysisPermission(deps.query.actorRole, AnalysisPermission.Read);

  await deps.getTenderUseCase.execute({
    organizationId: deps.query.organizationId,
    tenderId: deps.query.tenderId,
    actorRole: deps.query.actorRole,
  });

  const analysisVersion = await resolveLatestAnalysisVersion(deps.businessAnalysisRepository, {
    organizationId: deps.query.organizationId,
    tenderId: deps.query.tenderId,
    requestedVersion: deps.query.analysisVersion,
  });

  if (analysisVersion === undefined) {
    return { items: [], total: 0, limit: deps.query.limit, offset: deps.query.offset };
  }

  const page = await deps.list({
    organizationId: deps.query.organizationId,
    tenderId: deps.query.tenderId,
    analysisVersion,
    limit: deps.query.limit,
    offset: deps.query.offset,
  });

  return { items: page.items, total: page.total, limit: deps.query.limit, offset: deps.query.offset, analysisVersion };
}
