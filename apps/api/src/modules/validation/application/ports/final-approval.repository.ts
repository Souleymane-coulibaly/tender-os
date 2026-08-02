import type { FinalApproval } from "../../domain/final-approval.aggregate";

export interface FinalApprovalRepository {
  create(approval: FinalApproval): Promise<void>;
  findById(input: { organizationId: string; approvalId: string }): Promise<FinalApproval | null>;
  findActiveForTender(input: { organizationId: string; tenderId: string }): Promise<FinalApproval | null>;
  save(approval: FinalApproval): Promise<void>;
}

export const FINAL_APPROVAL_REPOSITORY = Symbol("FINAL_APPROVAL_REPOSITORY");
