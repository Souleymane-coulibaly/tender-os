import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { DumeDeclarationHasNoVersionError, DumeDeclarationNotFoundError } from "../../domain/errors";
import { buildDumeXmlDraft } from "../services/renderable-document-builders/dume-xml-draft.builder";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { DUME_DECLARATION_REPOSITORY, DUME_DECLARATION_VERSION_REPOSITORY, type DumeDeclarationRepository, type DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";

export type GetDumeXmlDraftQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;
export type DumeXmlDraft = Readonly<{ xml: string; fileName: string }>;

/**
 * Sprint 8C Phase 3 — mission : contrairement aux 5 générateurs PDF, ce use case ne persiste
 * RIEN — aucun `Document`, aucun `AdministrativeDocument`, aucune révision. Le XML "brouillon" ne
 * respecte PAS le schéma ESPD officiel (voir `dume-xml-draft.builder.ts`) et ne doit donc JAMAIS
 * pouvoir apparaître dans la checklist ni dans un package de soumission — le garder strictement
 * en dehors du pipeline `AdministrativeDocument`/`AttachAdministrativeDocumentRevisionUseCase` est
 * la garantie structurelle de cette règle, pas seulement une convention documentée.
 */
@Injectable()
export class GetDumeXmlDraftUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DUME_DECLARATION_REPOSITORY) private readonly declarationRepository: DumeDeclarationRepository,
    @Inject(DUME_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: DumeDeclarationVersionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetDumeXmlDraftQuery): Promise<DumeXmlDraft> {
    const declaration = await this.declarationRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!declaration) throw new DumeDeclarationNotFoundError();
    if (declaration.currentVersionNumber < 1) throw new DumeDeclarationHasNoVersionError();

    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });

    const [tender, versions] = await Promise.all([
      this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole }),
      this.versionRepository.listByDeclaration({ organizationId: query.organizationId, dumeDeclarationId: declaration.id }),
    ]);
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion) throw new DumeDeclarationHasNoVersionError();

    const xml = buildDumeXmlDraft({ data: latestVersion.data, version: latestVersion.version, tenderId: query.tenderId, tenderTitle: tender.title, generatedAt: this.clock.now() });
    return { xml, fileName: `dume-brouillon-non-officiel-v${latestVersion.version}.xml` };
  }
}
