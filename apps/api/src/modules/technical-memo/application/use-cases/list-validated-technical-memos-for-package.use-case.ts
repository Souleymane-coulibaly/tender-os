import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { GENERATED_DOCUMENT_REPOSITORY, GeneratedDocumentRevisionStatus, type GeneratedDocumentRepository } from "../../../document-generation";
import { assertTechnicalMemoTenderAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";

export type ListValidatedTechnicalMemosForPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Un mémoire technique exporté, prêt à être inclus dans un dossier de réponse — la référence
 *  document/version est déjà celle du DERNIER export réussi (mission §37 "bonne version, statut
 *  acceptable"), jamais un second accès Documents ici. */
export type TechnicalMemoForPackage = Readonly<{
  technicalMemoId: string;
  lotId?: string | undefined;
  label: string;
  documentId: string;
  documentVersionId: string;
}>;

/**
 * Sprint 14 — port en LECTURE SEULE réexporté pour `response-package` (même motif que
 * `ListValidatedAdministrativeDocumentsForPackageUseCase`, module `administrative-dossier`, Sprint
 * 8C Phase 2) — ne retourne QUE les mémoires dont le DERNIER export a réellement réussi
 * (`GeneratedDocumentRevisionStatus.Completed`) ET porte une référence Documents complète, jamais
 * une supposition. Ne réanalyse jamais le mémoire (mission §37 "ne pas réanalyser entièrement").
 */
@Injectable()
export class ListValidatedTechnicalMemosForPackageUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(query: ListValidatedTechnicalMemosForPackageQuery): Promise<readonly TechnicalMemoForPackage[]> {
    await assertTechnicalMemoTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });

    const memos = await this.technicalMemoRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId });
    const result: TechnicalMemoForPackage[] = [];

    for (const memo of memos) {
      if (!memo.documentTemplateId) continue;
      const lineage = await this.generatedDocumentRepository.findLatestByScope({
        organizationId: query.organizationId,
        tenderId: memo.tenderId,
        documentTemplateId: memo.documentTemplateId,
        subjectId: memo.id,
      });
      if (!lineage) continue;
      const revision = await this.generatedDocumentRepository.findLatestRevision({ organizationId: query.organizationId, generatedDocumentId: lineage.id });
      if (!revision || revision.status !== GeneratedDocumentRevisionStatus.Completed || !revision.artifactDocumentId || !revision.artifactDocumentVersionId) {
        continue;
      }
      result.push({
        technicalMemoId: memo.id,
        lotId: memo.lotId,
        label: "Mémoire technique",
        documentId: revision.artifactDocumentId,
        documentVersionId: revision.artifactDocumentVersionId,
      });
    }

    return result;
  }
}
