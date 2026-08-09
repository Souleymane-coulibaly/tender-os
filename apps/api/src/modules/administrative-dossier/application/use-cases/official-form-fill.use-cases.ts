import { Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { GeneratedDocumentSummary } from "../../../document-generation";
import { GetTenderUseCase } from "../../../tenders";
import type { AdministrativeFormReadiness } from "../../domain/administrative-form-readiness";
import { assertAdministrativeFormAccess } from "../policies/administrative-form-access.policy";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { OfficialFormGenerationRunner } from "../services/official-form-generation-runner.service";
import { Dc1OfficialFormResolver } from "../services/official-form-mappers/dc1-official-form-resolver.service";
import { Dc4OfficialFormResolver } from "../services/official-form-mappers/dc4-official-form-resolver.service";

const DC1_TEMPLATE_NAME = "DC1";
const DC4_TEMPLATE_NAME = "DC4";

export type GetDc1FormFillReadinessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * V2 Sprint 11 — mission §35/§60 "voir les données disponibles/manquantes sans jamais générer" :
 * calcule la Field Readiness du VRAI formulaire DC1 officiel, AUCUN `GeneratedDocument` n'est créé
 * ici (mission "la préparation/l'aperçu ne génèrent jamais de fichier", même discipline que
 * `PrepareOfficialFormUseCase`/`PreviewOfficialFormUseCase` pour l'Annexe DC4). `ClientPermission.
 * ReadAdministrativeDossier` suffit (consultation), jamais `GenerateAdministrativeForm`.
 */
@Injectable()
export class GetDc1FormFillReadinessUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc1OfficialFormResolver,
  ) {}

  async execute(query: GetDc1FormFillReadinessQuery): Promise<AdministrativeFormReadiness> {
    await assertAdministrativeFormAccess(this.accessService, { organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole, clientPermission: ClientPermission.ReadAdministrativeDossier });
    const { readiness } = await this.resolver.resolve(query);
    return readiness;
  }
}

export type GenerateDc1FormFillCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; requestId?: string | undefined }>;

/**
 * V2 Sprint 11 — génère le VRAI DC1 officiel rempli (moteur Sprint 10, gabarit dérivé du DOCX
 * gouvernemental réel), jamais l'Annexe TenderOS (Sprint 8C.1, moteur IR séparé). Reste
 * STRICTEMENT une action volontaire : aucun autre use case de ce module n'appelle celui-ci
 * automatiquement (mission §5/§6/§34/§35 "la génération reste facultative"). `subjectId: null` —
 * une seule lignée DC1 par Tender (mission "une lettre de candidature par Tender").
 * Correctif Sprint 11B : retrouve désormais la lignée existante via `OfficialFormGenerationRunner`
 * (Sprint 11A créait à tort une nouvelle lignée à chaque appel, l'historique R1/R2 n'était jamais
 * réellement exercé).
 */
@Injectable()
export class GenerateDc1FormFillUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc1OfficialFormResolver,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly runner: OfficialFormGenerationRunner,
  ) {}

  async execute(command: GenerateDc1FormFillCommand): Promise<GeneratedDocumentSummary> {
    await assertAdministrativeFormAccess(this.accessService, { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, clientPermission: ClientPermission.GenerateAdministrativeForm, requireGenerateOrgPermission: true });

    // `resolver.resolve` revérifie sa propre lecture (Tender/CompanyProfile/Consortium) — TOUJOURS
    // résolue au moment du lancement, jamais réutilisée d'un appel readiness antérieur (mission
    // "snapshot figé au lancement, jamais une donnée périmée").
    const [{ data }, tender] = await Promise.all([
      this.resolver.resolve({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId }),
      this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole }),
    ]);

    return this.runner.run({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      clientAccountId: tender.clientAccountId,
      templateName: DC1_TEMPLATE_NAME,
      subjectId: null,
      documentTitle: `DC1 - Lettre de candidature (${tender.title})`,
      data,
      auditAction: "AdministrativeFormGenerated",
      outboxEventTypeCompleted: "AdministrativeFormGenerated",
      outboxEventTypeFailed: "AdministrativeFormGenerationFailed",
      auditMetadata: { documentType: "DC1" },
      requestId: command.requestId,
    });
  }
}

export type GetDc4FormFillReadinessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; subcontractorDeclarationId: string }>;

@Injectable()
export class GetDc4FormFillReadinessUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc4OfficialFormResolver,
  ) {}

  async execute(query: GetDc4FormFillReadinessQuery): Promise<AdministrativeFormReadiness> {
    // `resolver.resolve` charge la déclaration EN PREMIER (org-scopée) puis dérive le tenderId —
    // jamais un `tenderId` fourni séparément et non vérifié (même discipline que
    // `AdministrativeFormDataAssembler.assembleForDc4`).
    const { readiness, tenderId } = await this.resolver.resolve(query);
    await assertAdministrativeFormAccess(this.accessService, { organizationId: query.organizationId, tenderId, actorId: query.actorId, actorRole: query.actorRole, clientPermission: ClientPermission.ReadAdministrativeDossier });
    return readiness;
  }
}

export type GenerateDc4FormFillCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; subcontractorDeclarationId: string; requestId?: string | undefined }>;

/** `subjectId = subcontractorDeclarationId` — une lignée par déclaration, jamais partagée entre
 *  deux déclarations du même Tender (mission "isolation stricte entre déclarations"). */
@Injectable()
export class GenerateDc4FormFillUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc4OfficialFormResolver,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly runner: OfficialFormGenerationRunner,
  ) {}

  async execute(command: GenerateDc4FormFillCommand): Promise<GeneratedDocumentSummary> {
    const resolved = await this.resolver.resolve(command);
    await assertAdministrativeFormAccess(this.accessService, { organizationId: command.organizationId, tenderId: resolved.tenderId, actorId: command.actorId, actorRole: command.actorRole, clientPermission: ClientPermission.GenerateAdministrativeForm, requireGenerateOrgPermission: true });

    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: resolved.tenderId, actorId: command.actorId, actorRole: command.actorRole });

    return this.runner.run({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: resolved.tenderId,
      clientAccountId: tender.clientAccountId,
      templateName: DC4_TEMPLATE_NAME,
      subjectId: command.subcontractorDeclarationId,
      documentTitle: `DC4 - Declaration de sous-traitance (${tender.title})`,
      data: resolved.data,
      auditAction: "AdministrativeFormGenerated",
      outboxEventTypeCompleted: "AdministrativeFormGenerated",
      outboxEventTypeFailed: "AdministrativeFormGenerationFailed",
      auditMetadata: { documentType: "DC4", subcontractorDeclarationId: command.subcontractorDeclarationId },
      requestId: command.requestId,
    });
  }
}
