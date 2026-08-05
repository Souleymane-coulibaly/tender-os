import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeChecklistLineState } from "../../domain/administrative-checklist";
import { deriveAttestationStatus, AdministrativeAttestationStatus } from "../../domain/administrative-attestation";
import { AdministrativeSignatureMode, AdministrativeSignatureStatus } from "../../domain/administrative-signature";
import type { AdministrativeDossierCapabilities } from "../dtos";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY, type AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import { buildAdministrativeChecklistView } from "../services/administrative-checklist-view.builder";

export type GetAdministrativeDossierCapabilitiesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Sprint 8C Phase 1/2 — mission §25 : les règles métier sont calculées côté BACKEND, jamais
 * uniquement côté frontend. `canEdit`/`canValidate` réutilisent la policy centralisée
 * `AssertClientAccessUseCase` en mode "sonde" (essai/capture, jamais une seconde implémentation de
 * la règle d'accès) plutôt que de dupliquer la logique de rôle. Phase 2 : `canGenerateXxx` reflètent
 * uniquement le droit d'édition (aucune autre précondition métier n'existe pour l'instant — jamais
 * une valeur inventée) ; `signatureSummary`/`warnings` (attestations bientôt expirées) sont calculés
 * ici, jamais par le frontend.
 */
@Injectable()
export class GetAdministrativeDossierCapabilitiesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly requirementRepository: AdministrativeRequirementRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
  ) {}

  async execute(query: GetAdministrativeDossierCapabilitiesQuery): Promise<AdministrativeDossierCapabilities> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadAdministrativeDossier,
    });

    const canEdit = await this.hasPermission({ organizationId: query.organizationId, clientAccountId: tender.clientAccountId, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.ManageAdministrativeDossier });
    const canValidate = await this.hasPermission({ organizationId: query.organizationId, clientAccountId: tender.clientAccountId, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.ValidateAdministrativeDossier });

    const checklist = await buildAdministrativeChecklistView({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      requirementRepository: this.requirementRepository,
      documentRepository: this.documentRepository,
      revisionRepository: this.revisionRepository,
      now: new Date(),
    });

    const blockers: string[] = [];
    const missingMandatory = checklist.lines.filter((line) => line.required && line.state === AdministrativeChecklistLineState.Manquant).length;
    if (missingMandatory > 0) {
      blockers.push(`${missingMandatory} pièce(s) obligatoire(s) manquante(s).`);
    }
    const expiredMandatory = checklist.lines.filter((line) => line.required && line.state === AdministrativeChecklistLineState.Expire).length;
    if (expiredMandatory > 0) {
      blockers.push(`${expiredMandatory} pièce(s) obligatoire(s) expirée(s).`);
    }

    const tenderDeadline = tender.submissionDeadline ? new Date(tender.submissionDeadline) : undefined;
    const { signatureSummary, warnings } = await this.computeSignatureAndExpiryWarnings(query, tenderDeadline);

    return {
      canView: true,
      canEdit,
      canValidate,
      canGenerateDc1: canEdit,
      canGenerateDc2: canEdit,
      canGenerateDc4: canEdit,
      canGenerateDume: canEdit,
      canGenerateEngagementAct: canEdit,
      signatureSummary,
      blockers,
      warnings,
    };
  }

  /** Mission §16/§25 — parcourt les pièces du dossier (pas seulement celles liées à une exigence
   *  confirmée) pour compter les signatures réellement requises et signaler les attestations
   *  bientôt expirées — jamais un second calcul divergent de `deriveAttestationStatus`. */
  private async computeSignatureAndExpiryWarnings(query: GetAdministrativeDossierCapabilitiesQuery, tenderDeadline: Date | undefined): Promise<{ signatureSummary: { required: number; pending: number; signed: number }; warnings: string[] }> {
    const dossier = await this.dossierRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!dossier) {
      return { signatureSummary: { required: 0, pending: 0, signed: 0 }, warnings: [] };
    }
    const documents = await this.documentRepository.listByDossier({ organizationId: query.organizationId, administrativeDossierId: dossier.id });

    let required = 0;
    let pending = 0;
    let signed = 0;
    const warnings: string[] = [];
    const now = new Date();

    for (const document of documents) {
      if (document.signatureMode !== AdministrativeSignatureMode.NotRequired) {
        required += 1;
        if (document.signatureStatus === AdministrativeSignatureStatus.Pending) pending += 1;
        if (document.signatureStatus === AdministrativeSignatureStatus.Signed) signed += 1;
      }

      const revisions = await this.revisionRepository.listByDocument({ organizationId: query.organizationId, administrativeDocumentId: document.id });
      const validatedRevision = document.validatedRevisionId ? revisions.find((r) => r.id === document.validatedRevisionId) : undefined;
      const status = deriveAttestationStatus({
        hasValidatedRevision: document.validatedRevisionId !== undefined,
        latestRevisionRejected: revisions[revisions.length - 1]?.status === "REJECTED",
        expiresAt: validatedRevision?.expiresAt,
        now,
        tenderDeadline,
      });
      if (status === AdministrativeAttestationStatus.ExpiringSoon) {
        warnings.push(`« ${document.label} » expire bientôt.`);
      }
    }

    return { signatureSummary: { required, pending, signed }, warnings };
  }

  private async hasPermission(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string; permission: ClientPermission }): Promise<boolean> {
    try {
      await this.assertClientAccessUseCase.execute(input);
      return true;
    } catch {
      return false;
    }
  }
}
