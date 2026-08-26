import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { APPROVAL_REQUEST_REPOSITORY, type ApprovalRequestRepository } from "../ports/approval-request.repository";
import { toApprovalRequestSummary, type ApprovalRequestSummary } from "../dtos";

export type ListMyApprovalsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  status?: string | undefined;
  clientAccountId?: string | undefined;
}>;

type ResolvedScope = { restrictToClientAccountIds: readonly string[] | undefined };
/** Sentinelle "aucun client accessible" — distincte d'un `restrictToClientAccountIds` vide, pour
 *  qu'un appelant ne puisse jamais confondre "pas d'accès" et "pas de filtre". */
const NO_ACCESS = Symbol("NO_ACCESS");

/** V2 Sprint 18 (mission §63-65 "Review Center — Mes validations") — même discipline ClientAccess
 *  que `GetMyTasksUseCase` (mission §35, Sprint 7) : réutilise `ListAccessibleClientsUseCase`,
 *  jamais un filtrage en mémoire après chargement complet. Par défaut : demandes où
 *  `reviewerId === actorId` (mission §64 "requests où current user = approver"), tous Tenders
 *  confondus, jamais limité au Tender courant. */
@Injectable()
export class ListMyApprovalsUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY) private readonly approvalRepository: ApprovalRequestRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListMyApprovalsQuery): Promise<ApprovalRequestSummary[]> {
    const scope = await this.resolveScope(query);
    if (scope === NO_ACCESS) {
      return [];
    }

    const approvals = await this.approvalRepository.listByReviewer({
      organizationId: query.organizationId,
      reviewerId: query.actorId,
      restrictToClientAccountIds: scope.restrictToClientAccountIds,
      status: query.status,
    });
    return approvals.map(toApprovalRequestSummary);
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12.1 — MÊME périmètre que `execute`, compté par PostgreSQL.
   * Existe pour le KPI Dashboard "Validations en attente : N", qui matérialisait toutes les lignes
   * pour n'en lire que la longueur. Porté par CE use case (et non par un second use case qui aurait
   * recopié la résolution ClientAccess ci-dessous) : la règle d'accès reste écrite une seule fois,
   * donc le compteur ne peut pas diverger de la liste.
   */
  async count(query: ListMyApprovalsQuery): Promise<number> {
    const scope = await this.resolveScope(query);
    if (scope === NO_ACCESS) {
      return 0;
    }

    return this.approvalRepository.countByReviewer({
      organizationId: query.organizationId,
      reviewerId: query.actorId,
      restrictToClientAccountIds: scope.restrictToClientAccountIds,
      status: query.status,
    });
  }

  private async resolveScope(query: ListMyApprovalsQuery): Promise<ResolvedScope | typeof NO_ACCESS> {
    const accessible = await this.listAccessibleClientsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole });
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return NO_ACCESS;
    }

    // Même motif que `GetMyTasksQuery.clientAccountId` (Sprint 15, correctif audit Codex P2-01) —
    // un filtre client non accessible ne peut jamais élargir le périmètre, jamais un contournement.
    if (query.clientAccountId) {
      const authorized = accessible.allClients || accessible.clientAccountIds.includes(query.clientAccountId);
      return { restrictToClientAccountIds: authorized ? [query.clientAccountId] : [] };
    }
    return { restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds };
  }
}
