import { Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { loadChecklistItem, type ChecklistItemRepository } from "../../../tenders";
import { GetSectionRevisionTenderRefForApprovalUseCase } from "../../../technical-memo";
import { GetVersionTenderRefForApprovalUseCase as GetPricingScheduleVersionTenderRefForApprovalUseCase, PricingScheduleVersionStatus } from "../../../pricing-schedule";
import { GetVersionTenderRefForApprovalUseCase as GetResponsePackageVersionTenderRefForApprovalUseCase, ResponsePackageVersionStatus } from "../../../response-package";
import { ApprovalEntityType } from "../../domain/approval-request.entity";
import { ApprovalTargetNotImmutableError, InvalidCommentEntityError } from "../../domain/errors";
import type { TaskRepository } from "../ports/task.repository";
import { loadTask } from "../use-cases/update-task.use-case";

/** V2 Sprint 18 (mission §26/§31, décision AskUserQuestion) — autorité de l'approbateur RÉUTILISE
 *  les permissions `Validate*` déjà existantes par module cible (Sprint 8/12/13/14), jamais de
 *  nouvelle permission `Approve*` dédiée : le CLIENT_MANAGER qui peut verrouiller sa propre version
 *  (`ValidateTechnicalMemo`/`ValidatePricingSchedule`/`ValidateResponsePackage`) est exactement qui
 *  doit pouvoir approuver une demande externe portant dessus — l'auto-approbation reste interdite
 *  au niveau domaine (`requestedBy !== reviewerId`), donc réutiliser la même permission ne permet
 *  jamais un contournement. TASK/CHECKLIST_ITEM gardent `ValidateWorkspace` (comportement Sprint 7
 *  inchangé). */
export function requiredValidatePermissionForApprovalEntityType(entityType: ApprovalEntityType): ClientPermission {
  switch (entityType) {
    case ApprovalEntityType.Task:
    case ApprovalEntityType.ChecklistItem:
      return ClientPermission.ValidateWorkspace;
    case ApprovalEntityType.TechnicalMemoSectionRevision:
      return ClientPermission.ValidateTechnicalMemo;
    case ApprovalEntityType.PricingScheduleVersion:
      return ClientPermission.ValidatePricingSchedule;
    case ApprovalEntityType.ResponsePackageVersion:
      return ClientPermission.ValidateResponsePackage;
  }
}

@Injectable()
export class ApprovalTargetResolver {
  constructor(
    private readonly getSectionRevisionTenderRef: GetSectionRevisionTenderRefForApprovalUseCase,
    private readonly getPricingScheduleVersionTenderRef: GetPricingScheduleVersionTenderRefForApprovalUseCase,
    private readonly getResponsePackageVersionTenderRef: GetResponsePackageVersionTenderRefForApprovalUseCase,
  ) {}

  /** Vérifie que `entityId` appartient bien au `tenderId`/`organizationId` de la demande — jamais un
   *  `findById` nu (même discipline que `assertCommentEntityBelongsToTender`, mission §20 par
   *  analogie) — ET, pour les trois cibles documentaires (mission §25 "point critique"), que la
   *  version ciblée est déjà IMMUABLE :
   *    - TECHNICAL_MEMO_SECTION_REVISION : toujours immuable dès sa création (une révision n'est
   *      jamais mutée en place), aucune vérification de statut supplémentaire nécessaire ;
   *    - PRICING_SCHEDULE_VERSION / RESPONSE_PACKAGE_VERSION : doit déjà être VALIDATED, sinon
   *      `ApprovalTargetNotImmutableError` (décision AskUserQuestion "jamais DRAFT/IN_REVIEW"). */
  async assertRequestable(
    repositories: { taskRepository: TaskRepository; checklistItemRepository: ChecklistItemRepository },
    input: { organizationId: string; tenderId: string; entityType: ApprovalEntityType; entityId: string },
  ): Promise<void> {
    switch (input.entityType) {
      case ApprovalEntityType.Task:
        await loadTask(repositories.taskRepository, { organizationId: input.organizationId, tenderId: input.tenderId, taskId: input.entityId });
        return;
      case ApprovalEntityType.ChecklistItem:
        await loadChecklistItem(repositories.checklistItemRepository, { organizationId: input.organizationId, tenderId: input.tenderId, itemId: input.entityId });
        return;
      case ApprovalEntityType.TechnicalMemoSectionRevision: {
        const ref = await this.getSectionRevisionTenderRef.execute({ organizationId: input.organizationId, revisionId: input.entityId });
        if (!ref || ref.tenderId !== input.tenderId) {
          throw new InvalidCommentEntityError();
        }
        return;
      }
      case ApprovalEntityType.PricingScheduleVersion: {
        const ref = await this.getPricingScheduleVersionTenderRef.execute({ organizationId: input.organizationId, pricingScheduleVersionId: input.entityId });
        if (!ref || ref.tenderId !== input.tenderId) {
          throw new InvalidCommentEntityError();
        }
        if (ref.status !== PricingScheduleVersionStatus.Validated) {
          throw new ApprovalTargetNotImmutableError();
        }
        return;
      }
      case ApprovalEntityType.ResponsePackageVersion: {
        const ref = await this.getResponsePackageVersionTenderRef.execute({ organizationId: input.organizationId, responsePackageVersionId: input.entityId });
        if (!ref || ref.tenderId !== input.tenderId) {
          throw new InvalidCommentEntityError();
        }
        if (ref.status !== ResponsePackageVersionStatus.Validated) {
          throw new ApprovalTargetNotImmutableError();
        }
        return;
      }
    }
  }
}
