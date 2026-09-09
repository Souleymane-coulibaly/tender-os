import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CandidatePermission } from "../../../candidate-company/domain/candidate-permission";
import { DownloadDocumentVersionUseCase, GetDocumentUseCase, ListDocumentVersionsUseCase, type DocumentDownload, type DocumentSummary, type DocumentVersionSummary } from "../../../documents";
import { isBankingDocumentCategory } from "../../domain/candidate-document-category";
import { computeTemporalValidityStatus, type TemporalValidityStatus } from "../../domain/enums";
import { CandidateDocumentAssociationNotFoundError, DuplicateDocumentClientAccountAssociationError } from "../../domain/errors";
import type { DocumentCandidateCompanyAssociationRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY,
  type DocumentCandidateCompanyAssociationRepository,
} from "../ports/company-satellite.repository";
import { CandidateCapabilityAccessService } from "../services/candidate-capability-access.service";

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — bibliothèque documentaire de l'entreprise candidate.
 *
 * AUCUN SECOND MOTEUR DOCUMENTAIRE. Le fichier, son stockage, son checksum, ses versions et son
 * téléchargement restent intégralement portés par `Document`/`DocumentVersion` : ces use cases
 * COMPOSENT les use cases publics du module `documents` (`GetDocumentUseCase`,
 * `DownloadDocumentVersionUseCase`), jamais un accès direct au stockage. L'upload d'un fichier et
 * l'ajout d'une version passent par les routes `documents` existantes — les dupliquer en multipart
 * ici recréerait la validation de type MIME, la sanitisation de nom, le calcul de checksum et la
 * numérotation de version, c'est-à-dire exactement le second moteur que la mission interdit.
 *
 * Ce module n'apporte donc que l'APPARTENANCE métier et ses métadonnées : catégorie, libellé,
 * dates d'émission et de validité — c'est la SOT de « ce document est une pièce de CETTE entreprise
 * candidate ».
 *
 * SÉCURITÉ BANCAIRE (CCV2-C.1) : un document de catégorie bancaire n'est jamais lisible avec le
 * seul `candidate:read`. Il exige `candidate:read_banking`, y compris via la route générique
 * `/documents/:id/download` — voir `CandidateDocumentAccessNarrowingService`.
 *
 * AUCUN FALLBACK : l'absence d'association candidate ne déclenche jamais une recherche dans les
 * documents du `sourceClientAccountId`.
 */

export type CandidateDocumentView = Readonly<{
  association: DocumentCandidateCompanyAssociationRecord;
  /** Calculé à la lecture depuis `validUntil` — jamais persisté (même discipline que les
   *  assurances/certifications : un statut temporel stocké devient faux dès le lendemain). */
  temporalStatus: TemporalValidityStatus;
}>;

export type ListCandidateDocumentsQuery = Readonly<{ organizationId: string; candidateCompanyId: string; actorRole: string }>;

export type AttachCandidateDocumentCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorId: string;
  actorRole: string;
  documentId: string;
  category: string;
  label?: string | undefined;
  issuedAt?: Date | undefined;
  validFrom?: Date | undefined;
  validUntil?: Date | undefined;
}>;

export type UpdateCandidateDocumentCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  patch: Readonly<{ category?: string | undefined; label?: string | undefined; issuedAt?: Date | undefined; validFrom?: Date | undefined; validUntil?: Date | undefined }>;
}>;

export type CandidateDocumentEntityCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
}>;

/** Lire une pièce bancaire exige TOUJOURS `read_banking` en plus de `read` — jamais l'un OU
 *  l'autre. La catégorie vient de la ligne d'association en base, jamais du client. */
function requiredReadPermission(category: string): CandidatePermission {
  return isBankingDocumentCategory(category) ? CandidatePermission.ReadBanking : CandidatePermission.Read;
}

@Injectable()
export class ListCandidateDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
  ) {}

  async execute(query: ListCandidateDocumentsQuery): Promise<CandidateDocumentView[]> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.Read });
    const associations = await this.repository.list({ organizationId: query.organizationId, candidateCompanyId: query.candidateCompanyId });

    // Le listing générique n'expose JAMAIS les pièces bancaires à un acteur sans `read_banking` :
    // elles sont retirées de la liste, plutôt que renvoyées « masquées » — une entrée masquée
    // révélerait encore leur existence et leur date d'échéance.
    const seesBanking = await this.accessService
      .assertCandidateAccess({ ...query, permission: CandidatePermission.ReadBanking })
      .then(() => true)
      .catch(() => false);

    return associations
      .filter((association) => seesBanking || !isBankingDocumentCategory(association.category))
      .map((association) => ({ association, temporalStatus: computeTemporalValidityStatus(association.validUntil, new Date()) }));
  }
}

@Injectable()
export class AttachCandidateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: AttachCandidateDocumentCommand): Promise<DocumentCandidateCompanyAssociationRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.DocumentUpload });
    // Rattacher une pièce BANCAIRE exige en plus le palier bancaire : sans cela, un CONTRIBUTOR
    // pourrait déposer un RIB qu'il n'aurait pas le droit de relire.
    if (isBankingDocumentCategory(command.category)) {
      await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    }

    // Le Document doit exister DANS CETTE organisation et être visible de l'acteur — vérifié par le
    // use case public du module `documents`, jamais par une requête directe.
    const document = await this.getDocumentUseCase.execute({
      organizationId: command.organizationId,
      documentId: command.documentId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const existing = await this.repository.findByDocument({
      organizationId: command.organizationId,
      candidateCompanyId: command.candidateCompanyId,
      documentId: document.id,
    });
    if (existing) {
      throw new DuplicateDocumentClientAccountAssociationError();
    }

    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      documentId: document.id,
      candidateCompanyId: command.candidateCompanyId,
      category: command.category,
      label: command.label ?? null,
      issuedAt: command.issuedAt ?? null,
      validFrom: command.validFrom ?? null,
      validUntil: command.validUntil ?? null,
      createdByUserId: command.actorId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.document_attached",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      // Ni contenu, ni clé de stockage, ni identifiant bancaire : uniquement des références.
      metadata: { documentId: document.id, category: command.category },
    });
    return created;
  }
}

@Injectable()
export class GetCandidateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
  ) {}

  async execute(query: CandidateDocumentEntityCommand): Promise<CandidateDocumentView & { document: DocumentSummary }> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.Read });
    const association = await this.repository.findByDocument(query);
    if (!association) {
      throw new CandidateDocumentAssociationNotFoundError();
    }
    // La catégorie réelle décide du palier requis — pas ce que l'appelant prétend.
    await this.accessService.assertCandidateAccess({ ...query, permission: requiredReadPermission(association.category) });

    const document = await this.getDocumentUseCase.execute({
      organizationId: query.organizationId,
      documentId: query.documentId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });
    return { association, temporalStatus: computeTemporalValidityStatus(association.validUntil, new Date()), document };
  }
}

@Injectable()
export class DownloadCandidateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    private readonly downloadUseCase: DownloadDocumentVersionUseCase,
  ) {}

  async execute(query: CandidateDocumentEntityCommand & { versionId?: string | undefined }): Promise<DocumentDownload> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.Read });
    const association = await this.repository.findByDocument(query);
    if (!association) {
      throw new CandidateDocumentAssociationNotFoundError();
    }
    await this.accessService.assertCandidateAccess({ ...query, permission: requiredReadPermission(association.category) });

    return this.downloadUseCase.execute({
      organizationId: query.organizationId,
      documentId: query.documentId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      ...(query.versionId === undefined ? {} : { versionId: query.versionId }),
    });
  }
}

@Injectable()
export class UpdateCandidateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCandidateDocumentCommand): Promise<DocumentCandidateCompanyAssociationRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.DocumentUpload });

    const existing = await this.repository.findByDocument(command);
    if (!existing) {
      throw new CandidateDocumentAssociationNotFoundError();
    }
    // Requalifier une pièce EN bancaire, ou requalifier une pièce bancaire, exige le palier
    // bancaire — sinon la catégorie deviendrait un contournement de la garde.
    if (isBankingDocumentCategory(existing.category) || (command.patch.category !== undefined && isBankingDocumentCategory(command.patch.category))) {
      await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    }

    const updated = await this.repository.update(command, command.patch);
    if (!updated) {
      throw new CandidateDocumentAssociationNotFoundError();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.document_metadata_updated",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { documentId: command.documentId },
    });
    return updated;
  }
}

@Injectable()
export class DetachCandidateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  /**
   * DISSOCIATION, jamais suppression du Document. Le modèle autorise plusieurs associations pour un
   * même fichier (Tender, autre candidat, base de connaissances) : détruire le Document depuis ici
   * casserait un dossier de réponse déjà constitué ailleurs. Le fichier reste supprimable par son
   * propre cycle de vie, via `DELETE /documents/:id`.
   */
  async execute(command: CandidateDocumentEntityCommand): Promise<void> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.DocumentDelete });

    const existing = await this.repository.findByDocument(command);
    if (!existing) {
      throw new CandidateDocumentAssociationNotFoundError();
    }
    if (isBankingDocumentCategory(existing.category)) {
      await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    }

    const detached = await this.repository.detach(command);
    if (!detached) {
      throw new CandidateDocumentAssociationNotFoundError();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.document_detached",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { documentId: command.documentId },
    });
  }
}

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.1 — historique des versions d'une pièce candidate.
 *
 * FAÇADE, jamais un second moteur : la liste des versions vient de `ListDocumentVersionsUseCase`,
 * le seul endroit qui la produit. Ce use case ajoute ce que la route générique ne peut pas savoir —
 * que le Document est bien rattaché à CETTE entreprise candidate — et applique le palier de lecture
 * réel de la pièce (bancaire ou non), exactement comme la lecture et le téléchargement.
 *
 * Un document existant mais NON associé à ce candidat est traité comme inexistant : 404, jamais un
 * 403 qui confirmerait son existence.
 */
@Injectable()
export class ListCandidateDocumentVersionsUseCase {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    private readonly listDocumentVersionsUseCase: ListDocumentVersionsUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
  ) {}

  async execute(query: CandidateDocumentEntityCommand): Promise<{ versions: readonly DocumentVersionSummary[]; currentVersionId: string | undefined }> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.Read });

    const association = await this.repository.findByDocument(query);
    if (!association) {
      throw new CandidateDocumentAssociationNotFoundError();
    }
    // La catégorie RÉELLE décide du palier requis — jamais ce que prétend l'appelant.
    await this.accessService.assertCandidateAccess({ ...query, permission: requiredReadPermission(association.category) });

    const [versions, document] = await Promise.all([
      this.listDocumentVersionsUseCase.execute({ organizationId: query.organizationId, documentId: query.documentId, actorRole: query.actorRole }),
      // La version COURANTE est le pointeur porté par le Document lui-même. La déduire du numéro le
      // plus élevé produirait une valeur qui semble juste mais peut diverger du pointeur réel.
      this.getDocumentUseCase.execute({
        organizationId: query.organizationId,
        documentId: query.documentId,
        actorId: query.actorId,
        actorRole: query.actorRole,
      }),
    ]);
    return { versions, currentVersionId: document.currentVersion?.id };
  }
}
