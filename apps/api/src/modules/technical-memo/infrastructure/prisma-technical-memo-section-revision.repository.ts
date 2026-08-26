import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TechnicalMemoSectionRevisionRepository } from "../application/ports/technical-memo-section-revision.repository";
import type { TechnicalMemoSectionCitation } from "../domain/technical-memo-section-citation.value-object";
import type { TechnicalMemoSectionRevision } from "../domain/technical-memo-section-revision.entity";
import { toTechnicalMemoSectionCitationRow } from "./technical-memo-section-citation.persistence-mapper";
import { toDomainTechnicalMemoSectionRevision, toTechnicalMemoSectionRevisionRow } from "./technical-memo-section-revision.persistence-mapper";

@Injectable()
export class PrismaTechnicalMemoSectionRevisionRepository implements TechnicalMemoSectionRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockSection(input: { organizationId: string; technicalMemoSectionId: string }): Promise<void> {
    await this.prisma
      .currentClient()
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.organizationId}:${input.technicalMemoSectionId}`}))`;
  }

  async create(input: { revision: TechnicalMemoSectionRevision; citations: readonly TechnicalMemoSectionCitation[] }): Promise<void> {
    const { revision, citations } = input;
    const row = toTechnicalMemoSectionRevisionRow(revision);

    // Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-09) — les citations sont ecrites par une
    // SECONDE instruction, jamais par une ecriture imbriquee.
    //
    // `organizationId` et `technicalMemoSectionId` participent a la relation COMPOSITE
    // `section` (@relation(fields: [technicalMemoSectionId, organizationId], ...)). Melanger ces
    // scalaires avec un `citations: { createMany }` imbrique forcait Prisma sur l'entree CHECKED,
    // qui refuse les scalaires de cle etrangere : `PrismaClientValidationError: Unknown argument
    // 'organizationId'`. Le defaut ne se manifestait QUE lorsqu'il y avait reellement des citations
    // — c'est-a-dire sur le chemin de generation REUSSIE, rendu inatteignable par F-03 : aucune
    // revision generee par l'IA ne pouvait donc etre persistee.
    //
    // Les deux instructions restent dans LA MEME transaction (`finalize` s'execute sous
    // `atomicTransactionRunner.run`, et `currentClient()` rend le client transactionnel courant) :
    // l'atomicite revision+citations est strictement preservee.
    await this.prisma.currentClient().technicalMemoSectionRevision.create({ data: row });
    if (citations.length > 0) {
      await this.prisma.currentClient().technicalMemoSectionCitation.createMany({
        data: citations.map(toTechnicalMemoSectionCitationRow),
      });
    }
  }

  async findById(input: { organizationId: string; revisionId: string }): Promise<TechnicalMemoSectionRevision | null> {
    const record = await this.prisma.currentClient().technicalMemoSectionRevision.findFirst({
      where: { id: input.revisionId, organizationId: input.organizationId },
      include: { citations: true },
    });
    return record ? toDomainTechnicalMemoSectionRevision(record) : null;
  }

  async listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRevision[]> {
    const records = await this.prisma.currentClient().technicalMemoSectionRevision.findMany({
      where: { organizationId: input.organizationId, technicalMemoSectionId: input.technicalMemoSectionId },
      include: { citations: true },
      orderBy: { revisionNumber: "desc" },
    });
    return records.map(toDomainTechnicalMemoSectionRevision);
  }

  async findLatestBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSectionRevision | null> {
    const record = await this.prisma.currentClient().technicalMemoSectionRevision.findFirst({
      where: { organizationId: input.organizationId, technicalMemoSectionId: input.technicalMemoSectionId },
      include: { citations: true },
      orderBy: { revisionNumber: "desc" },
    });
    return record ? toDomainTechnicalMemoSectionRevision(record) : null;
  }

  async nextRevisionNumber(input: { organizationId: string; technicalMemoSectionId: string }): Promise<number> {
    const latest = await this.prisma.currentClient().technicalMemoSectionRevision.findFirst({
      where: { organizationId: input.organizationId, technicalMemoSectionId: input.technicalMemoSectionId },
      orderBy: { revisionNumber: "desc" },
    });
    return (latest?.revisionNumber ?? 0) + 1;
  }
}
