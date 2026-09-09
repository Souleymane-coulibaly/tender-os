import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentCandidateCompanyAssociationRecord } from "../application/dtos";
import type { CandidateScope, DocumentCandidateCompanyAssociationRepository, Patch } from "../application/ports/company-satellite.repository";
import { BANKING_DOCUMENT_CATEGORIES } from "../domain/candidate-document-category";

/** Checkpoint TENDEROS-2.1-CCV2-D — toutes les requêtes sont bornées par `(organizationId,
 *  candidateCompanyId)`, jamais par le seul `documentId` : un document d'un autre candidat de la
 *  MÊME organisation ne peut donc pas être lu/modifié/dissocié en changeant l'id dans l'URL. */
@Injectable()
export class PrismaDocumentCandidateCompanyAssociationRepository implements DocumentCandidateCompanyAssociationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<DocumentCandidateCompanyAssociationRecord, "createdAt">): Promise<DocumentCandidateCompanyAssociationRecord> {
    return this.prisma.documentCandidateCompanyAssociation.create({ data: input });
  }

  async list(scope: CandidateScope): Promise<DocumentCandidateCompanyAssociationRecord[]> {
    return this.prisma.documentCandidateCompanyAssociation.findMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByDocument(scope: CandidateScope & { documentId: string }): Promise<DocumentCandidateCompanyAssociationRecord | null> {
    return this.prisma.documentCandidateCompanyAssociation.findFirst({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId, documentId: scope.documentId },
    });
  }

  async update(
    scope: CandidateScope & { documentId: string },
    patch: Patch<Pick<DocumentCandidateCompanyAssociationRecord, "category" | "label" | "issuedAt" | "validFrom" | "validUntil">>,
  ): Promise<DocumentCandidateCompanyAssociationRecord | null> {
    const { count } = await this.prisma.documentCandidateCompanyAssociation.updateMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId, documentId: scope.documentId },
      // Même sémantique que les autres repositories du module : une clé `undefined` est omise du
      // SET par Prisma (« non fourni, ne pas toucher »), distinct de `null` (« effacer »).
      data: patch as Record<string, unknown>,
    });
    if (count === 0) return null;
    return this.findByDocument(scope);
  }

  async detach(scope: CandidateScope & { documentId: string }): Promise<boolean> {
    const { count } = await this.prisma.documentCandidateCompanyAssociation.deleteMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId, documentId: scope.documentId },
    });
    return count > 0;
  }

  async findAssociationsByDocument(input: { organizationId: string; documentId: string }): Promise<DocumentCandidateCompanyAssociationRecord[]> {
    return this.prisma.documentCandidateCompanyAssociation.findMany({
      where: { organizationId: input.organizationId, documentId: input.documentId },
    });
  }

  /** Checkpoint CCV2-I.3 — la liste des catégories bancaires vient du DOMAINE
   *  (`BANKING_CATEGORIES`), jamais d'une chaîne recopiée ici : dupliquer la classification de
   *  sécurité dans une requête SQL la ferait diverger au premier ajout de catégorie. */
  async findBankingDocumentIds(input: { organizationId: string; documentIds: readonly string[] }): Promise<readonly string[]> {
    if (input.documentIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.documentCandidateCompanyAssociation.findMany({
      where: {
        organizationId: input.organizationId,
        documentId: { in: [...input.documentIds] },
        category: { in: [...BANKING_DOCUMENT_CATEGORIES] },
      },
      select: { documentId: true },
    });
    return [...new Set(rows.map((row) => row.documentId))];
  }
}
