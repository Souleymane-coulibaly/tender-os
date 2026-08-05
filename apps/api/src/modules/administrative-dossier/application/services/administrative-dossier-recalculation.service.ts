import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { deriveAdministrativeDossierStatus } from "../../domain/administrative-dossier-status";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY, type AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import { buildAdministrativeChecklistView } from "./administrative-checklist-view.builder";

/**
 * Sprint 8C Phase 1 — mission §6/§15 : point d'entrée UNIQUE de recalcul du dossier administratif,
 * appelé après toute mutation d'une exigence/pièce/révision — jamais un statut posé directement
 * par un contrôleur (même discipline que `DeliverableStatusRecalculationService`).
 */
@Injectable()
export class AdministrativeDossierRecalculationService {
  constructor(
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly requirementRepository: AdministrativeRequirementRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async recompute(input: { organizationId: string; dossierId: string }): Promise<void> {
    const dossier = await this.dossierRepository.findById({ organizationId: input.organizationId, dossierId: input.dossierId });
    if (!dossier) return;

    const occurredAt = this.clock.now();
    const view = await buildAdministrativeChecklistView({
      organizationId: input.organizationId,
      tenderId: dossier.tenderId,
      requirementRepository: this.requirementRepository,
      documentRepository: this.documentRepository,
      revisionRepository: this.revisionRepository,
      now: occurredAt,
    });

    const mandatoryLineStates = view.lines.filter((line) => line.required).map((line) => line.state);
    const status = deriveAdministrativeDossierStatus({ mandatoryLineStates });

    dossier.applyComputedStatus({ status, completionPercentage: view.completionPercentage, occurredAt });
    await this.dossierRepository.save(dossier);
  }
}
