import { Inject, Injectable } from "@nestjs/common";
import { EXPORT_JOB_REPOSITORY, ExportMode, ExportStatus, type ExportJobRepository } from "../../../export";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { deriveDeliverableSectionStatus } from "../../domain/deliverable-section-status";
import {
  deriveAnnexesDeliverableStatus,
  deriveChecklistDeliverableStatus,
  deriveComplianceMatrixDeliverableStatus,
  deriveDeliverableStatus,
} from "../../domain/deliverable-status";
import { DeliverableType, isStructuredDeliverableType } from "../../domain/deliverable-type";
import { DELIVERABLE_ANNEX_REPOSITORY, type DeliverableAnnexRepository } from "../ports/deliverable-annex.repository";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import { CHECKLIST_PIECE_ENTRY_REPOSITORY, type ChecklistPieceEntryRepository } from "../ports/checklist-piece-entry.repository";
import { COMPLIANCE_MATRIX_ENTRY_REPOSITORY, type ComplianceMatrixEntryRepository } from "../ports/compliance-matrix-entry.repository";

/** Nombre d'exports FINAUX examinés pour retrouver le dernier COMPLETED de ce type de document —
 *  largement au-dessus de tout historique réaliste pour un même (tender, documentType). */
const EXPORT_HISTORY_SCAN_LIMIT = 500;

/**
 * Mission Sprint 8A.1 §15 — "le statut doit être calculé et contrôlé côté backend" : point d'entrée
 * UNIQUE de recalcul, appelé après toute mutation d'une révision (édition, soumission, revue,
 * validation) — jamais un statut posé directement par un contrôleur.
 */
@Injectable()
export class DeliverableStatusRecalculationService {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(DELIVERABLE_ANNEX_REPOSITORY) private readonly annexRepository: DeliverableAnnexRepository,
    @Inject(CHECKLIST_PIECE_ENTRY_REPOSITORY) private readonly checklistRepository: ChecklistPieceEntryRepository,
    @Inject(COMPLIANCE_MATRIX_ENTRY_REPOSITORY) private readonly complianceRepository: ComplianceMatrixEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Mission §15 — EXPORTED n'est jamais stocké : recalculé à chaque recompute depuis le dernier
   *  export FINAL réellement COMPLETED pour ce type de document, jamais un second état figé qui
   *  pourrait diverger de la réalité d'Export. */
  private async findLatestExportedAt(input: { organizationId: string; tenderId: string; documentType: string }): Promise<Date | undefined> {
    const { items } = await this.exportJobRepository.list({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      mode: ExportMode.Final,
      limit: EXPORT_HISTORY_SCAN_LIMIT,
      offset: 0,
    });
    const completed = items
      .map((item) => item.job)
      .filter((job) => job.documentType === input.documentType && job.status === ExportStatus.Completed && job.completedAt)
      .sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime());
    return completed[0]?.completedAt;
  }

  /** Recalcule UNE section à partir de sa révision la plus récente, puis propage au livrable parent. */
  async recomputeSection(input: { organizationId: string; deliverableSectionId: string; deliverableId: string }): Promise<void> {
    const section = await this.sectionRepository.findById({ organizationId: input.organizationId, sectionId: input.deliverableSectionId });
    if (!section) return;

    const latest = await this.revisionRepository.findLatestBySection({ organizationId: input.organizationId, deliverableSectionId: input.deliverableSectionId });
    const occurredAt = this.clock.now();
    section.applyComputedStatus(deriveDeliverableSectionStatus(latest ? { status: latest.status, editVersion: latest.editVersion } : undefined), occurredAt);
    await this.sectionRepository.save(section);

    await this.recomputeDeliverable({ organizationId: input.organizationId, deliverableId: input.deliverableId });
  }

  /** Recalcule le livrable à partir du statut de toutes ses sections visibles (mission §15). Les
   *  sections masquées (`hidden`) ne comptent jamais dans le calcul global — elles ne font pas
   *  partie du document final. */
  async recomputeDeliverable(input: { organizationId: string; deliverableId: string }): Promise<void> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: input.organizationId, deliverableId: input.deliverableId });
    if (!deliverable || !isStructuredDeliverableType(deliverable.type)) return;

    const sections = await this.sectionRepository.listByDeliverable({ organizationId: input.organizationId, deliverableId: input.deliverableId });
    const visible = sections.filter((s) => !s.hidden);
    const exportedAt = await this.findLatestExportedAt({ organizationId: input.organizationId, tenderId: deliverable.tenderId, documentType: deliverable.type });
    const status = deriveDeliverableStatus({ sectionStatuses: visible.map((s) => s.status), approvedAt: deliverable.approvedAt, exportedAt });
    deliverable.applyComputedStatus(status, this.clock.now());
    await this.deliverableRepository.save(deliverable);
  }

  /** Correctif — même point d'entrée unique que `recomputeDeliverable` (mission §15), mais pour les
   *  3 livrables en overlay léger (Annexes/Checklist/Matrice de conformité) : leur statut ne
   *  bougeait jamais de NOT_STARTED, ce recalcul n'ayant jamais été implémenté (voir
   *  `deriveAnnexesDeliverableStatus`/`deriveChecklistDeliverableStatus`/
   *  `deriveComplianceMatrixDeliverableStatus`, deliverable-status.ts). Ne touche jamais un livrable
   *  d'un autre type (structuré ou lecture seule) — appelé UNIQUEMENT par les use cases
   *  Create/Update des 3 types overlay. */
  async recomputeOverlayDeliverable(input: { organizationId: string; deliverableId: string }): Promise<void> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: input.organizationId, deliverableId: input.deliverableId });
    if (!deliverable) return;

    let status;
    if (deliverable.type === DeliverableType.Annexes) {
      const entries = await this.annexRepository.listByDeliverable({ organizationId: input.organizationId, deliverableId: input.deliverableId });
      status = deriveAnnexesDeliverableStatus(entries.map((entry) => entry.status));
    } else if (deliverable.type === DeliverableType.Checklist) {
      const entries = await this.checklistRepository.listByDeliverable({ organizationId: input.organizationId, deliverableId: input.deliverableId });
      status = deriveChecklistDeliverableStatus(entries.map((entry) => entry.status));
    } else if (deliverable.type === DeliverableType.ComplianceMatrix) {
      const entries = await this.complianceRepository.listByDeliverable({ organizationId: input.organizationId, deliverableId: input.deliverableId });
      status = deriveComplianceMatrixDeliverableStatus(entries.map((entry) => entry.coverageStatus));
    } else {
      return;
    }

    deliverable.applyComputedStatus(status, this.clock.now());
    await this.deliverableRepository.save(deliverable);
  }
}
