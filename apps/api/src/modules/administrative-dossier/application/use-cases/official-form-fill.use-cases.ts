import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import {
  ATOMIC_TRANSACTION_RUNNER,
  DOCUMENT_TEMPLATE_REPOSITORY,
  DocumentGenerationExecutionService,
  GENERATED_DOCUMENT_REPOSITORY,
  GeneratedDocument,
  toGeneratedDocumentSummary,
  type AtomicTransactionRunner,
  type DocumentTemplateRepository,
  type GeneratedDocumentRepository,
  type GeneratedDocumentSummary,
} from "../../../document-generation";
import { GetTenderUseCase } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import type { AdministrativeFormReadiness } from "../../domain/administrative-form-readiness";
import { OfficialFormTemplateNotConfiguredError } from "../../domain/errors";
import { assertAdministrativeFormAccess } from "../policies/administrative-form-access.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
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
 * automatiquement (mission §5/§6/§34/§35 "la génération reste facultative").
 */
@Injectable()
export class GenerateDc1FormFillUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc1OfficialFormResolver,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly executionService: DocumentGenerationExecutionService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: GenerateDc1FormFillCommand): Promise<GeneratedDocumentSummary> {
    await assertAdministrativeFormAccess(this.accessService, { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, clientPermission: ClientPermission.GenerateAdministrativeForm, requireGenerateOrgPermission: true });

    const found = await this.templateRepository.findByName({ organizationId: command.organizationId, name: DC1_TEMPLATE_NAME });
    if (!found) throw new OfficialFormTemplateNotConfiguredError(DC1_TEMPLATE_NAME);

    // `resolver.resolve` revérifie sa propre lecture (Tender/CompanyProfile/Consortium) — TOUJOURS
    // résolue au moment du lancement, jamais réutilisée d'un appel readiness antérieur (mission
    // "snapshot figé au lancement, jamais une donnée périmée").
    const [{ data }, tender] = await Promise.all([
      this.resolver.resolve({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId }),
      this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole }),
    ]);

    const occurredAt = this.clock.now();
    const generatedDocument = GeneratedDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      documentTemplateId: found.id,
      title: `DC1 - Lettre de candidature (${tender.title})`,
      createdBy: command.actorId,
      occurredAt,
    });

    const revision = await this.atomicTransactionRunner.run(async () => {
      await this.generatedDocumentRepository.create(generatedDocument);

      // Provenance RÉELLE résolue côté serveur — jamais depuis une entrée HTTP cliente (correctif
      // audit Codex P1-01, mission Sprint 10). Chaque champ pointe vers l'entité métier réelle dont
      // il a été extrait, jamais une provenance générique.
      const provenanceOverrides = Object.fromEntries(
        Object.keys(data).map((fieldKey) => [fieldKey, { sourceEntityType: "AdministrativeDossier", sourceEntityId: command.tenderId, valuePath: fieldKey }]),
      );

      const revision = await this.executionService.run({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        generatedDocumentId: generatedDocument.id,
        documentTemplateId: found.id,
        revisionNumber: 1,
        data,
        provenanceOverrides,
        documentTitle: generatedDocument.title,
        requestId: command.requestId,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "AdministrativeFormGenerated",
        resourceType: "generated_document",
        resourceId: generatedDocument.id,
        requestId: command.requestId,
        metadata: { documentType: "DC1", tenderId: command.tenderId, revisionStatus: revision.status, missingFieldCount: revision.missingFields.length },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: revision.status === "COMPLETED" ? "AdministrativeFormGenerated" : "AdministrativeFormGenerationFailed",
            aggregateType: "GeneratedDocument",
            aggregateId: generatedDocument.id,
            payload: { documentType: "DC1", tenderId: command.tenderId, revisionId: revision.id },
            occurredAt,
          },
        ],
      });

      return revision;
    });

    return toGeneratedDocumentSummary(generatedDocument, [revision]);
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

@Injectable()
export class GenerateDc4FormFillUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc4OfficialFormResolver,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly executionService: DocumentGenerationExecutionService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: GenerateDc4FormFillCommand): Promise<GeneratedDocumentSummary> {
    const resolved = await this.resolver.resolve(command);
    await assertAdministrativeFormAccess(this.accessService, { organizationId: command.organizationId, tenderId: resolved.tenderId, actorId: command.actorId, actorRole: command.actorRole, clientPermission: ClientPermission.GenerateAdministrativeForm, requireGenerateOrgPermission: true });

    const found = await this.templateRepository.findByName({ organizationId: command.organizationId, name: DC4_TEMPLATE_NAME });
    if (!found) throw new OfficialFormTemplateNotConfiguredError(DC4_TEMPLATE_NAME);

    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: resolved.tenderId, actorId: command.actorId, actorRole: command.actorRole });

    const occurredAt = this.clock.now();
    const generatedDocument = GeneratedDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: resolved.tenderId,
      documentTemplateId: found.id,
      title: `DC4 - Declaration de sous-traitance (${tender.title})`,
      createdBy: command.actorId,
      occurredAt,
    });

    const revision = await this.atomicTransactionRunner.run(async () => {
      await this.generatedDocumentRepository.create(generatedDocument);

      const provenanceOverrides = Object.fromEntries(
        Object.keys(resolved.data).map((fieldKey) => [fieldKey, { sourceEntityType: "SubcontractorDeclaration", sourceEntityId: command.subcontractorDeclarationId, valuePath: fieldKey }]),
      );

      const revision = await this.executionService.run({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        generatedDocumentId: generatedDocument.id,
        documentTemplateId: found.id,
        revisionNumber: 1,
        data: resolved.data,
        provenanceOverrides,
        documentTitle: generatedDocument.title,
        requestId: command.requestId,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "AdministrativeFormGenerated",
        resourceType: "generated_document",
        resourceId: generatedDocument.id,
        requestId: command.requestId,
        metadata: { documentType: "DC4", subcontractorDeclarationId: command.subcontractorDeclarationId, tenderId: resolved.tenderId, revisionStatus: revision.status, missingFieldCount: revision.missingFields.length },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: revision.status === "COMPLETED" ? "AdministrativeFormGenerated" : "AdministrativeFormGenerationFailed",
            aggregateType: "GeneratedDocument",
            aggregateId: generatedDocument.id,
            payload: { documentType: "DC4", subcontractorDeclarationId: command.subcontractorDeclarationId, tenderId: resolved.tenderId, revisionId: revision.id },
            occurredAt,
          },
        ],
      });

      return revision;
    });

    return toGeneratedDocumentSummary(generatedDocument, [revision]);
  }
}
