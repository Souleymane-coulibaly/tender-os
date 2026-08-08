import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { APPROVAL_REQUEST_REPOSITORY, type ApprovalRequestRepository } from "../ports/approval-request.repository";
import { toApprovalRequestSummary, type ApprovalRequestSummary } from "../dtos";

export type ListApprovalsQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string; status?: string | undefined }>;

@Injectable()
export class ListApprovalsUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY) private readonly approvalRepository: ApprovalRequestRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListApprovalsQuery): Promise<ApprovalRequestSummary[]> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const approvals = await this.approvalRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId, status: query.status });
    return approvals.map(toApprovalRequestSummary);
  }
}
