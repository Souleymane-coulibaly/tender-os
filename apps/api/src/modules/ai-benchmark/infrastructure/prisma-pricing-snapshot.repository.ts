import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PricingSnapshotRepository } from "../application/ports/pricing-snapshot.repository";
import type { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";
import { toDomain, toPersistence } from "./pricing-snapshot.persistence-mapper";

@Injectable()
export class PrismaPricingSnapshotRepository implements PricingSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { id: string }): Promise<AiModelPricingSnapshot | null> {
    const record = await this.prisma.aiModelPricingSnapshot.findUnique({ where: { id: input.id } });
    return record ? toDomain(record) : null;
  }

  async findCurrent(input: { aiModelId: string }): Promise<AiModelPricingSnapshot | null> {
    const record = await this.prisma.aiModelPricingSnapshot.findFirst({
      where: { aiModelId: input.aiModelId, effectiveTo: null },
    });
    return record ? toDomain(record) : null;
  }

  async listByModel(input: { aiModelId: string }): Promise<readonly AiModelPricingSnapshot[]> {
    const records = await this.prisma.aiModelPricingSnapshot.findMany({
      where: { aiModelId: input.aiModelId },
      orderBy: { effectiveFrom: "desc" },
    });
    return records.map(toDomain);
  }

  /** Clôt le snapshot courant puis insère le nouveau, dans une transaction courte unique — jamais
   *  deux écritures visibles séparément (mission §"une mise à jour de tarif ne doit pas modifier
   *  rétroactivement les coûts historiques" : l'ancien snapshot reste lisible tel quel, seul son
   *  `effectiveTo` change). L'index unique partiel `WHERE effective_to IS NULL` (migration) est le
   *  garde-fou de dernier recours si cette invariante était violée par un autre chemin. */
  async addSnapshot(snapshot: AiModelPricingSnapshot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.aiModelPricingSnapshot.findFirst({
        where: { aiModelId: snapshot.aiModelId, effectiveTo: null },
      });
      if (current) {
        await tx.aiModelPricingSnapshot.update({
          where: { id: current.id },
          data: { effectiveTo: snapshot.effectiveFrom },
        });
      }
      await tx.aiModelPricingSnapshot.create({ data: toPersistence(snapshot) });
    });
  }
}
