import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY, type AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import type { AdministrativeChecklistDto } from "../dtos";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { buildAdministrativeChecklistView } from "../services/administrative-checklist-view.builder";

export type GetAdministrativeChecklistQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Sprint 8C Phase 1 — mission §9 : la checklist est TOUJOURS calculée à la volée ici, jamais lue
 * depuis une valeur potentiellement périmée sur `AdministrativeDossier` (qui, elle, est maintenue
 * synchronisée séparément par `AdministrativeDossierRecalculationService` pour les pages qui
 * n'affichent que le résumé du dossier).
 */
@Injectable()
export class GetAdministrativeChecklistUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly requirementRepository: AdministrativeRequirementRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetAdministrativeChecklistQuery): Promise<AdministrativeChecklistDto> {
    await this.accessService.assertTenderAccess({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: query.tenderId,
      permission: ClientPermission.ReadAdministrativeDossier,
    });

    return buildAdministrativeChecklistView({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      requirementRepository: this.requirementRepository,
      documentRepository: this.documentRepository,
      revisionRepository: this.revisionRepository,
      now: this.clock.now(),
    });
  }
}
