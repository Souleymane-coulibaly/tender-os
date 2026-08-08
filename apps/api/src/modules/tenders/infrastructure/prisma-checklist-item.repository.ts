import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TenderChecklistItem as ChecklistItemRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ChecklistItemRepository } from "../application/ports/checklist-item.repository";
import {
  ChecklistItem,
  type ChecklistComplianceStatus,
  type ChecklistDocumentMatchStatus,
  type ChecklistDocumentStatus,
  type ChecklistItemCriticality,
  type ChecklistItemOrigin,
  type ChecklistItemStatus,
  type ChecklistItemType,
  type ChecklistRequirementLevel,
  type ChecklistSubjectType,
} from "../domain/checklist-item.entity";

function toDomain(record: ChecklistItemRecord): ChecklistItem {
  return ChecklistItem.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    title: record.title,
    description: record.description ?? undefined,
    required: record.required,
    status: record.status as ChecklistItemStatus,
    assignedTo: record.assignedTo ?? undefined,
    dueDate: record.dueDate ?? undefined,
    comment: record.comment ?? undefined,
    completedAt: record.completedAt ?? undefined,
    completedBy: record.completedBy ?? undefined,
    displayOrder: record.displayOrder,
    type: record.type as ChecklistItemType,
    requirementLevel: record.requirementLevel as ChecklistRequirementLevel,
    conditionText: record.conditionText ?? undefined,
    criticality: record.criticality as ChecklistItemCriticality,
    complianceStatus: record.complianceStatus as ChecklistComplianceStatus,
    documentStatus: record.documentStatus as ChecklistDocumentStatus,
    origin: record.origin as ChecklistItemOrigin,
    subjectType: record.subjectType as ChecklistSubjectType,
    subjectSubcontractorProfileId: record.subjectSubcontractorProfileId ?? undefined,
    lotId: record.lotId ?? undefined,
    matchedDocumentId: record.matchedDocumentId ?? undefined,
    matchedDocumentVersionId: record.matchedDocumentVersionId ?? undefined,
    documentMatchStatus: record.documentMatchStatus as ChecklistDocumentMatchStatus,
    documentMatchScore: record.documentMatchScore ?? undefined,
    documentMatchReasons: (record.documentMatchReasons as string[] | null) ?? undefined,
    documentExpiresAt: record.documentExpiresAt ?? undefined,
    documentValidityCheckedAt: record.documentValidityCheckedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(item: ChecklistItem) {
  return {
    id: item.id,
    organizationId: item.organizationId,
    tenderId: item.tenderId,
    title: item.title,
    description: item.description ?? null,
    required: item.required,
    status: item.status,
    assignedTo: item.assignedTo ?? null,
    dueDate: item.dueDate ?? null,
    comment: item.comment ?? null,
    completedAt: item.completedAt ?? null,
    completedBy: item.completedBy ?? null,
    displayOrder: item.displayOrder,
    type: item.type,
    requirementLevel: item.requirementLevel,
    conditionText: item.conditionText ?? null,
    criticality: item.criticality,
    complianceStatus: item.complianceStatus,
    documentStatus: item.documentStatus,
    origin: item.origin,
    subjectType: item.subjectType,
    subjectSubcontractorProfileId: item.subjectSubcontractorProfileId ?? null,
    lotId: item.lotId ?? null,
    matchedDocumentId: item.matchedDocumentId ?? null,
    matchedDocumentVersionId: item.matchedDocumentVersionId ?? null,
    documentMatchStatus: item.documentMatchStatus,
    documentMatchScore: item.documentMatchScore ?? null,
    documentMatchReasons: (item.documentMatchReasons as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    documentExpiresAt: item.documentExpiresAt ?? null,
    documentValidityCheckedAt: item.documentValidityCheckedAt ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

@Injectable()
export class PrismaChecklistItemRepository implements ChecklistItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    tenderId: string;
    itemId: string;
  }): Promise<ChecklistItem | null> {
    const record = await this.prisma.currentClient().tenderChecklistItem.findFirst({
      where: { id: input.itemId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<ChecklistItem[]> {
    const records = await this.prisma.currentClient().tenderChecklistItem.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { displayOrder: "asc" },
    });
    return records.map(toDomain);
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<ChecklistItem[]> {
    if (input.tenderIds.length === 0) return [];
    const records = await this.prisma.currentClient().tenderChecklistItem.findMany({
      where: { organizationId: input.organizationId, tenderId: { in: [...input.tenderIds] } },
    });
    return records.map(toDomain);
  }

  async save(item: ChecklistItem): Promise<void> {
    const data = toPersistence(item);
    await this.prisma.currentClient().tenderChecklistItem.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async lockTenderForDedup(input: { organizationId: string; tenderId: string }): Promise<void> {
    // `pg_advisory_xact_lock(int4, int4)` — deux clés (organisation + tender) plutôt qu'un seul
    // hash pour éviter toute collision artificielle entre deux Tenders de deux organisations
    // différentes dont les hashes individuels coïncideraient. Verrou libéré automatiquement à la
    // fin de la transaction ambiante (`prisma.currentClient()`), jamais de déverrouillage manuel.
    await this.prisma
      .currentClient()
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}), hashtext(${input.tenderId}))`;
  }
}
