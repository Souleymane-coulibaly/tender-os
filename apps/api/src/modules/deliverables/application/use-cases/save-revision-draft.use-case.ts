import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type SaveRevisionDraftCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  revisionId: string;
  content: unknown;
  expectedEditVersion: number;
  changeNote?: string | undefined;
}>;

/**
 * Mission Sprint 8A.1 §9/§18 — sauvegarde d'un brouillon d'édition humaine. Concurrence : un
 * `expectedEditVersion` obsolète produit un `RevisionEditConflictError` (409 côté HTTP), jamais un
 * écrasement silencieux — scénario mandaté "A sauvegarde, B tente de sauvegarder une version
 * obsolète → conflit explicite, aucune donnée perdue".
 */
@Injectable()
export class SaveRevisionDraftUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SaveRevisionDraftCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    section.assertEditable();

    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }

    revision.applyEdit({ content: command.content, expectedEditVersion: command.expectedEditVersion, changeNote: command.changeNote, occurredAt: this.clock.now() });

    // Verrou optimiste appliqué CÔTÉ INFRASTRUCTURE (updateMany where editVersion = expected),
    // jamais seulement en mémoire — voir `DeliverableRevisionRepository.saveWithOptimisticLock`.
    await this.revisionRepository.saveWithOptimisticLock({ revision, expectedEditVersion: command.expectedEditVersion });
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });

    return toDeliverableRevisionSummary(revision);
  }
}
