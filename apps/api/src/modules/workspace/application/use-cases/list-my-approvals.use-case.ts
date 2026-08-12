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
    const accessible = await this.listAccessibleClientsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole });
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return [];
    }

    // Même motif que `GetMyTasksQuery.clientAccountId` (Sprint 15, correctif audit Codex P2-01) —
    // un filtre client non accessible ne peut jamais élargir le périmètre, jamais un contournement.
    let restrictToClientAccountIds: readonly string[] | undefined;
    if (query.clientAccountId) {
      const authorized = accessible.allClients || accessible.clientAccountIds.includes(query.clientAccountId);
      restrictToClientAccountIds = authorized ? [query.clientAccountId] : [];
    } else {
      restrictToClientAccountIds = accessible.allClients ? undefined : accessible.clientAccountIds;
    }

    const approvals = await this.approvalRepository.listByReviewer({
      organizationId: query.organizationId,
      reviewerId: query.actorId,
      restrictToClientAccountIds,
      status: query.status,
    });
    return approvals.map(toApprovalRequestSummary);
  }
}
