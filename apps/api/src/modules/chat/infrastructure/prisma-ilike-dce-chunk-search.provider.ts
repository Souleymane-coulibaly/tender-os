import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DceChunkMatch, DceChunkSearchProvider } from "../application/ports/dce-chunk-search-provider";

const MAX_CANDIDATES = 200;

/**
 * Recherche textuelle ILIKE sur `extraction_chunks` (mission §"jamais un moteur vectoriel externe
 * pour cette tranche", aucun pgvector câblé dans le repo) — même motif que
 * `PrismaIlikeKnowledgeSearchProvider` (module Knowledge Base). Résout la chaîne
 * Tender → Dce → DceDocument → Document AVANT toute requête sur les chunks : un Tender sans DCE (ou
 * dont le DCE n'a aucun document) retourne simplement une liste vide, jamais une erreur.
 *
 * Correctif audit Codex round 2 P1 — `documentVersionId` provient de
 * `DocumentExtraction.documentVersionId` (la version RÉELLEMENT lue pour produire CES chunks),
 * JAMAIS de `Document.currentVersionId` (qui peut avoir avancé depuis l'extraction, rendant une
 * citation historiquement fausse — ex. Document V1 extrait → chunk cité → upload V2 → une citation
 * dérivée de `currentVersionId` désignerait alors V2 pour un contenu qui vient de V1).
 * `undefined` pour toute extraction antérieure à cette colonne (jamais un backfill approximatif,
 * voir la migration) — le Chat doit alors afficher "version inconnue", jamais inventer une version.
 */
@Injectable()
export class PrismaIlikeDceChunkSearchProvider implements DceChunkSearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: { organizationId: string; tenderId: string; query: string; limit: number }): Promise<readonly DceChunkMatch[]> {
    const dce = await this.prisma.currentClient().dce.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      select: { id: true },
    });
    if (!dce) return [];

    const dceDocuments = await this.prisma.currentClient().dceDocument.findMany({
      where: { organizationId: input.organizationId, dceId: dce.id },
      select: { documentId: true },
    });
    const documentIds = dceDocuments.map((doc) => doc.documentId);
    if (documentIds.length === 0) return [];

    const [documents, extractions, chunks] = await Promise.all([
      this.prisma.currentClient().document.findMany({
        where: { organizationId: input.organizationId, id: { in: documentIds } },
        select: { id: true, title: true },
      }),
      this.prisma.currentClient().documentExtraction.findMany({
        where: { organizationId: input.organizationId, documentId: { in: documentIds } },
        select: { documentId: true, documentVersionId: true },
      }),
      this.prisma.currentClient().extractionChunk.findMany({
        where: { organizationId: input.organizationId, documentId: { in: documentIds }, content: { contains: input.query, mode: "insensitive" } },
        select: { documentId: true, sequence: true, content: true, pageStart: true, pageEnd: true, sheetName: true, sectionTitle: true },
        take: Math.min(input.limit, MAX_CANDIDATES),
      }),
    ]);
    const titleByDocumentId = new Map(documents.map((document) => [document.id, document.title]));
    const versionIdByDocumentId = new Map(extractions.map((extraction) => [extraction.documentId, extraction.documentVersionId ?? undefined]));

    return chunks.map(
      (chunk): DceChunkMatch => ({
        documentId: chunk.documentId,
        documentVersionId: versionIdByDocumentId.get(chunk.documentId),
        documentTitle: titleByDocumentId.get(chunk.documentId) ?? "Document",
        chunkSequence: chunk.sequence,
        content: chunk.content,
        pageStart: chunk.pageStart ?? undefined,
        pageEnd: chunk.pageEnd ?? undefined,
        sheetName: chunk.sheetName ?? undefined,
        sectionTitle: chunk.sectionTitle ?? undefined,
      }),
    );
  }
}
