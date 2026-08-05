import type { AdministrativeChecklistResult, AdministrativeDocumentRevisionView, AdministrativeDocumentView, ConfirmedRequirementView } from "../../domain/administrative-checklist";
import { computeAdministrativeChecklist } from "../../domain/administrative-checklist";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import type { AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";

/**
 * Sprint 8C Phase 1 — logique de CHARGEMENT partagée entre `GetAdministrativeChecklistUseCase`
 * (lecture, jamais de recalcul stocké potentiellement périmé) et
 * `AdministrativeDossierRecalculationService` (écriture, recalcule et persiste le statut du
 * dossier) : seule la dérivation PURE (`computeAdministrativeChecklist`, domaine) est déjà
 * partagée par construction ; cette fonction évite de dupliquer la logique d'ASSEMBLAGE depuis les
 * repositories.
 */
export async function buildAdministrativeChecklistView(input: {
  organizationId: string;
  tenderId: string;
  requirementRepository: AdministrativeRequirementRepository;
  documentRepository: AdministrativeDocumentRepository;
  revisionRepository: AdministrativeDocumentRevisionRepository;
  now: Date;
}): Promise<AdministrativeChecklistResult> {
  const confirmed = await input.requirementRepository.listConfirmedByTender({ organizationId: input.organizationId, tenderId: input.tenderId });

  const requirementViews: ConfirmedRequirementView[] = confirmed.map((requirement) => ({
    requirementId: requirement.id,
    title: requirement.title,
    expectedDocumentType: requirement.expectedDocumentType,
    required: requirement.required,
    applicable: requirement.applicable,
    signatureRequired: requirement.signatureRequired,
    matchedDocumentId: requirement.matchedDocumentId,
  }));

  const matchedDocumentIds = [...new Set(requirementViews.map((view) => view.matchedDocumentId).filter((id): id is string => id !== undefined))];
  const documents = await Promise.all(matchedDocumentIds.map((documentId) => input.documentRepository.findById({ organizationId: input.organizationId, documentId })));

  const documentsById = new Map<string, AdministrativeDocumentView>();
  const revisionsByDocumentId = new Map<string, readonly AdministrativeDocumentRevisionView[]>();
  for (const document of documents) {
    if (!document) continue;
    documentsById.set(document.id, { documentId: document.id, validatedRevisionId: document.validatedRevisionId });
    const revisions = await input.revisionRepository.listByDocument({ organizationId: input.organizationId, administrativeDocumentId: document.id });
    revisionsByDocumentId.set(
      document.id,
      revisions.map((revision) => ({ revisionId: revision.id, status: revision.status, hasAttachedFile: revision.hasAttachedFile, expiresAt: revision.expiresAt })),
    );
  }

  return computeAdministrativeChecklist({ requirements: requirementViews, documentsById, revisionsByDocumentId, now: input.now });
}
