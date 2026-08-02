import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableExportSelectionRepository } from "../application/ports/deliverable-export-selection.repository";
import type { DeliverableExportSelection } from "../domain/deliverable-export-selection.entity";
import { toDomainExportSelection, toExportSelectionRow } from "./deliverable-export-selection.persistence-mapper";

@Injectable()
export class PrismaDeliverableExportSelectionRepository implements DeliverableExportSelectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Mission §11 — une section n'a jamais qu'une seule sélection active pour l'export : upsert par
   *  la contrainte unique `(deliverableSectionId, organizationId)`, remplace l'éventuelle
   *  sélection précédente plutôt que d'en accumuler plusieurs. */
  async upsert(selection: DeliverableExportSelection): Promise<void> {
    const row = toExportSelectionRow(selection);
    await this.prisma.deliverableExportSelection.upsert({
      where: { deliverableSectionId_organizationId: { deliverableSectionId: row.deliverableSectionId, organizationId: row.organizationId } },
      create: row,
      update: {
        deliverableRevisionId: row.deliverableRevisionId,
        selectedBy: row.selectedBy,
        selectedAt: row.selectedAt,
        justification: row.justification,
      },
    });
  }

  async findBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<DeliverableExportSelection | null> {
    const record = await this.prisma.deliverableExportSelection.findFirst({
      where: { organizationId: input.organizationId, deliverableSectionId: input.deliverableSectionId },
    });
    return record ? toDomainExportSelection(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableExportSelection[]> {
    const records = await this.prisma.deliverableExportSelection.findMany({
      where: { organizationId: input.organizationId, deliverableSection: { deliverableId: input.deliverableId } },
    });
    return records.map(toDomainExportSelection);
  }
}
