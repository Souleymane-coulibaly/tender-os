import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { assertTechnicalMemoTenderAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, type TechnicalMemoSectionRevisionRepository } from "../ports/technical-memo-section-revision.repository";

export type GetTechnicalMemoRevisionFingerprintForTenderQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Checkpoint 2.1-P2.1-FIX-E — port en LECTURE SEULE réexporté pour `validation` (même motif que
 * `ListValidatedTechnicalMemosForPackageUseCase` réexporté pour `response-package`, Sprint 14) :
 * jamais un second accès direct aux repositories depuis `validation`.
 *
 * FIX-D a établi qu'aucune version globale de mémoire n'existe dans ce modèle (la SOT de version
 * est `TechnicalMemoSectionRevision.revisionNumber`, SCOPÉE PAR SECTION) — inventer un "numéro de
 * version de mémoire" pour `validation` violerait cette conclusion. Cette empreinte SHA-256 est la
 * provenance MINIMALE honnête (mission §11) : elle change si et seulement si le contenu réel d'AU
 * MOINS UN mémoire du tender a changé (nouvelle révision sur une section existante, nouvelle
 * section) — jamais une approximation temporelle (`updatedAt` du mémoire n'est PAS fiable, il n'est
 * bumpé que par `markExported`, jamais par une génération/édition de section, voir
 * `technical-memo.aggregate.ts`).
 *
 * `NULL` (retour `undefined`) si le tender n'a AUCUN Technical Memo — dimension non applicable pour
 * l'appelant, jamais une dépendance fabriquée.
 */
@Injectable()
export class GetTechnicalMemoRevisionFingerprintForTenderUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY) private readonly revisionRepository: TechnicalMemoSectionRevisionRepository,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(query: GetTechnicalMemoRevisionFingerprintForTenderQuery): Promise<string | undefined> {
    await assertTechnicalMemoTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });

    const memos = await this.technicalMemoRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (memos.length === 0) return undefined;

    const parts: string[] = [];
    for (const memo of [...memos].sort((a, b) => a.id.localeCompare(b.id))) {
      const sections = await this.sectionRepository.listByMemoId({ organizationId: query.organizationId, technicalMemoId: memo.id });
      for (const section of [...sections].sort((a, b) => a.id.localeCompare(b.id))) {
        const latest = await this.revisionRepository.findLatestBySectionId({ organizationId: query.organizationId, technicalMemoSectionId: section.id });
        parts.push(`${memo.id}:${section.id}:${latest?.revisionNumber ?? 0}`);
      }
    }

    return createHash("sha256").update(parts.join("|")).digest("hex");
  }
}
