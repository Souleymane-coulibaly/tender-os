import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type ListValidatedAdministrativeDocumentsForPackageQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  /** Checkpoint TENDEROS-2.1-P2.2-F3 — CandidateCompany EFFECTIF du Tender au moment de l'appel
   *  (mission §18/§25/§32), jamais résolu ici. `undefined` = Tender legacy sans candidat résolu,
   *  auquel cas AUCUN filtrage candidat n'est appliqué (mission §27 "ne pas casser l'historique"). */
  candidateCompanyId: string | undefined;
}>;

/** Une pièce administrative validée, prête à être incluse dans un package de soumission — la
 *  référence document/version est déjà VÉRIFIÉE (posée uniquement via `verifyAttachableDocument` au
 *  moment de l'attachement, mission §21), jamais un second accès Documents ici. */
export type AdministrativeDocumentForPackage = Readonly<{
  administrativeDocumentId: string;
  label: string;
  documentType: string;
  documentId: string;
  documentVersionId: string;
  documentChecksum: string;
  documentFileName: string;
  documentMimeType: string;
}>;

/**
 * Sprint 8C Phase 2 — mission §"intégration package" : port en LECTURE SEULE réexporté pour
 * `submission-package` (même motif que `ListDeliverablesUseCase` réexporté pour `cockpit`) — ne
 * retourne QUE les pièces dont `validatedRevisionId` est posé ET dont la révision validée porte
 * bien une référence Documents complète (une révision validée sans fichier attaché ne devrait pas
 * exister en pratique, mais n'est jamais supposée ici).
 */
@Injectable()
export class ListValidatedAdministrativeDocumentsForPackageUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
  ) {}

  async execute(query: ListValidatedAdministrativeDocumentsForPackageQuery): Promise<readonly AdministrativeDocumentForPackage[]> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });

    const dossier = await this.dossierRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!dossier) return [];

    const documents = await this.documentRepository.listByDossier({ organizationId: query.organizationId, administrativeDossierId: dossier.id });
    const result: AdministrativeDocumentForPackage[] = [];

    for (const document of documents) {
      if (!document.validatedRevisionId) continue;
      const revisions = await this.revisionRepository.listByDocument({ organizationId: query.organizationId, administrativeDocumentId: document.id });
      const validatedRevision = revisions.find((r) => r.id === document.validatedRevisionId);
      if (!validatedRevision?.documentId || !validatedRevision.documentVersionId || !validatedRevision.documentChecksum || !validatedRevision.documentFileName || !validatedRevision.documentMimeType) {
        continue;
      }
      // Checkpoint TENDEROS-2.1-P2.2-F3.1, mission §17/§18/§20 (resserre F3, correctif audit Codex P2)
      // — en NEW FLOW (`query.candidateCompanyId` renseigné), `candidateCompanyId=NULL` n'est PLUS un
      // joker : une révision historique sans provenance capturée ne peut satisfaire AUCUN candidat
      // NEW FLOW, jamais seulement celles explicitement d'un AUTRE candidat (mission §18 matrice, cas
      // D). En LEGACY FLOW (`query.candidateCompanyId === undefined`, Tender sans candidat résolu),
      // le comportement historique reste inchangé — AUCUN filtrage (mission §27/§32 "ne pas casser
      // l'historique", cas A de la matrice). Les révisions NULL elles-mêmes restent immuables — c'est
      // leur APPLICABILITÉ au NEW FLOW qui change ici, jamais leur donnée (mission §19/§21, aucun
      // backfill).
      if (query.candidateCompanyId !== undefined && validatedRevision.candidateCompanyId !== query.candidateCompanyId) {
        continue;
      }
      result.push({
        administrativeDocumentId: document.id,
        label: document.label,
        documentType: document.documentType,
        documentId: validatedRevision.documentId,
        documentVersionId: validatedRevision.documentVersionId,
        documentChecksum: validatedRevision.documentChecksum,
        documentFileName: validatedRevision.documentFileName,
        documentMimeType: validatedRevision.documentMimeType,
      });
    }

    return result;
  }
}
