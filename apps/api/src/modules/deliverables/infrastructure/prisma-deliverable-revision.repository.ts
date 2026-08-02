import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableRevisionRepository } from "../application/ports/deliverable-revision.repository";
import { DeliverableRevision } from "../domain/deliverable-revision.aggregate";
import { RevisionEditConflictError } from "../domain/errors";
import { toDomainRevision, toRevisionRow } from "./deliverable-revision.persistence-mapper";

@Injectable()
export class PrismaDeliverableRevisionRepository implements DeliverableRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(revision: DeliverableRevision): Promise<void> {
    await this.prisma.deliverableRevision.create({ data: toRevisionRow(revision) });
  }

  async findById(input: { organizationId: string; revisionId: string }): Promise<DeliverableRevision | null> {
    const record = await this.prisma.deliverableRevision.findFirst({ where: { id: input.revisionId, organizationId: input.organizationId } });
    return record ? toDomainRevision(record) : null;
  }

  async findLatestBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<DeliverableRevision | null> {
    const record = await this.prisma.deliverableRevision.findFirst({
      where: { organizationId: input.organizationId, deliverableSectionId: input.deliverableSectionId },
      orderBy: { revisionNumber: "desc" },
    });
    return record ? toDomainRevision(record) : null;
  }

  async listBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<readonly DeliverableRevision[]> {
    const records = await this.prisma.deliverableRevision.findMany({
      where: { organizationId: input.organizationId, deliverableSectionId: input.deliverableSectionId },
      orderBy: { revisionNumber: "desc" },
    });
    return records.map(toDomainRevision);
  }

  async nextRevisionNumber(input: { organizationId: string; deliverableSectionId: string }): Promise<number> {
    const latest = await this.prisma.deliverableRevision.findFirst({
      where: { organizationId: input.organizationId, deliverableSectionId: input.deliverableSectionId },
      orderBy: { revisionNumber: "desc" },
    });
    return (latest?.revisionNumber ?? 0) + 1;
  }

  /** Mission §18 — verrou optimiste appliqué CÔTÉ BASE (jamais seulement en mémoire) :
   *  `updateMany` filtré sur `editVersion = expectedEditVersion` (la valeur AVANT l'incrément déjà
   *  appliqué en mémoire par l'agrégat) ; `count === 0` signifie qu'une autre écriture a eu lieu
   *  entre-temps → conflit explicite, aucune donnée perdue. */
  async saveWithOptimisticLock(input: { revision: DeliverableRevision; expectedEditVersion: number }): Promise<void> {
    const row = toRevisionRow(input.revision);
    const { id, organizationId, ...data } = row;
    const result = await this.prisma.deliverableRevision.updateMany({
      where: { id, organizationId, editVersion: input.expectedEditVersion },
      data,
    });
    if (result.count === 0) {
      throw new RevisionEditConflictError();
    }
  }

  async save(revision: DeliverableRevision): Promise<void> {
    await this.prisma.deliverableRevision.update({ where: { id: revision.id }, data: toRevisionRow(revision) });
  }
}
