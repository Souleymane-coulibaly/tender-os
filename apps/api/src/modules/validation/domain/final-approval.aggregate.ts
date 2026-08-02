import { ApprovalAlreadyInvalidatedError, BlockingIssuesOpenError } from "./errors";
import type { ValidationIssue } from "./validation-issue";

export const FinalApprovalStatus = {
  Active: "ACTIVE",
  Invalidated: "INVALIDATED",
} as const;
export type FinalApprovalStatus = (typeof FinalApprovalStatus)[keyof typeof FinalApprovalStatus];

export type FinalApprovalProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportJobId: string;
  validationRunId: string;
  manifestHash: string;
  approvedBy: string;
  approverRole: string;
  approvedAt: Date;
  comment?: string | undefined;
  previousStatus?: string | undefined;
  nextStatus?: string | undefined;
  status: FinalApprovalStatus;
  invalidatedAt?: Date | undefined;
  invalidatedReason?: string | undefined;
};

/**
 * Mission Sprint 8A §28/§31/§32 — l'approbation d'un export précis. `manifestHash` fige la preuve
 * que la version qui sera exportée en FINAL est EXACTEMENT celle qui a été validée/approuvée.
 * Historique immuable : une invalidation ne supprime jamais la ligne, elle bascule `status`.
 */
export class FinalApproval {
  private constructor(private props: FinalApprovalProps) {}

  /** Refuse l'approbation si au moins un contrôle bloquant reste ouvert (mission "aucun contrôle
   *  bloquant ouvert ne doit permettre l'approbation") — vérifié sur l'état ACTUEL des issues,
   *  jamais uniquement sur le readiness figé au moment du run. */
  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    exportJobId: string;
    validationRunId: string;
    manifestHash: string;
    approvedBy: string;
    approverRole: string;
    comment?: string | undefined;
    previousStatus?: string | undefined;
    nextStatus?: string | undefined;
    occurredAt: Date;
    currentIssues: readonly ValidationIssue[];
  }): FinalApproval {
    const openBlocking = input.currentIssues.filter((issue) => issue.isBlocking && issue.isOpen);
    if (openBlocking.length > 0) {
      throw new BlockingIssuesOpenError(openBlocking.length);
    }
    return new FinalApproval({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      exportJobId: input.exportJobId,
      validationRunId: input.validationRunId,
      manifestHash: input.manifestHash,
      approvedBy: input.approvedBy,
      approverRole: input.approverRole,
      approvedAt: input.occurredAt,
      comment: input.comment,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      status: FinalApprovalStatus.Active,
    });
  }

  static rehydrate(props: FinalApprovalProps): FinalApproval {
    return new FinalApproval(props);
  }

  /** Mission §32 — toute modification de contenu/template/sélection après approbation invalide
   *  cette approbation pour la nouvelle version (l'ancienne ligne reste dans l'historique). */
  invalidate(input: { reason: string; occurredAt: Date }): void {
    if (this.props.status === FinalApprovalStatus.Invalidated) {
      throw new ApprovalAlreadyInvalidatedError();
    }
    this.props.status = FinalApprovalStatus.Invalidated;
    this.props.invalidatedAt = input.occurredAt;
    this.props.invalidatedReason = input.reason;
  }

  get isActive(): boolean {
    return this.props.status === FinalApprovalStatus.Active;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get exportJobId(): string {
    return this.props.exportJobId;
  }
  get validationRunId(): string {
    return this.props.validationRunId;
  }
  get manifestHash(): string {
    return this.props.manifestHash;
  }
  get approvedBy(): string {
    return this.props.approvedBy;
  }
  get approverRole(): string {
    return this.props.approverRole;
  }
  get approvedAt(): Date {
    return this.props.approvedAt;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get previousStatus(): string | undefined {
    return this.props.previousStatus;
  }
  get nextStatus(): string | undefined {
    return this.props.nextStatus;
  }
  get status(): FinalApprovalStatus {
    return this.props.status;
  }
  get invalidatedAt(): Date | undefined {
    return this.props.invalidatedAt;
  }
  get invalidatedReason(): string | undefined {
    return this.props.invalidatedReason;
  }
}
