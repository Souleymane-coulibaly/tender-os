import { Injectable } from "@nestjs/common";
import type { TenderChecklistItemSource as ChecklistItemSourceRecordModel } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  ChecklistItemSourceRecord,
  ChecklistItemSourceRepository,
  CreateChecklistItemSourceInput,
} from "../application/ports/checklist-item-source.repository";

function toDomain(record: ChecklistItemSourceRecordModel): ChecklistItemSourceRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    checklistItemId: record.checklistItemId,
    findingType: record.findingType ?? undefined,
    findingId: record.findingId ?? undefined,
    sourceSuggestionId: record.sourceSuggestionId ?? undefined,
    documentId: record.documentId ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    analysisVersion: record.analysisVersion ?? undefined,
    pageStart: record.pageStart ?? undefined,
    citation: record.citation ?? undefined,
    sectionTitle: record.sectionTitle ?? undefined,
    confidence: record.confidence ?? undefined,
    createdAt: record.createdAt,
  };
}

/** V2 Sprint 6 §11 — écrit dans `tender_checklist_item_sources`. Rejoint la transaction ambiante
 *  active (`PrismaService.currentClient()`, V2 Sprint 4 round 4) si présente, ex. lors de
 *  l'acceptation d'une AiSuggestion(CHECKLIST_ITEM) via `ai-suggestion-bridge`. */
@Injectable()
export class PrismaChecklistItemSourceRepository implements ChecklistItemSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateChecklistItemSourceInput): Promise<ChecklistItemSourceRecord> {
    const record = await this.prisma.currentClient().tenderChecklistItemSource.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        checklistItemId: input.checklistItemId,
        findingType: input.findingType ?? null,
        findingId: input.findingId ?? null,
        sourceSuggestionId: input.sourceSuggestionId ?? null,
        documentId: input.documentId ?? null,
        documentVersionId: input.documentVersionId ?? null,
        analysisVersion: input.analysisVersion ?? null,
        pageStart: input.pageStart ?? null,
        citation: input.citation ?? null,
        sectionTitle: input.sectionTitle ?? null,
        confidence: input.confidence ?? null,
        createdAt: input.createdAt,
      },
    });
    return toDomain(record);
  }

  async listByChecklistItem(input: { organizationId: string; checklistItemId: string }): Promise<ChecklistItemSourceRecord[]> {
    const records = await this.prisma.currentClient().tenderChecklistItemSource.findMany({
      where: { organizationId: input.organizationId, checklistItemId: input.checklistItemId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }
}
