import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import { AiSuggestionStatus } from "../domain/ai-suggestion-status";
import type { AiSuggestionRecord, AiSuggestionRepository, CreateAiSuggestionInput, PrismaTx } from "../application/ports/ai-suggestion.repository";
import { toAiSuggestionRecord } from "./ai-suggestion.persistence-mapper";

@Injectable()
export class PrismaAiSuggestionRepository implements AiSuggestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAiSuggestionInput): Promise<AiSuggestionRecord> {
    const created = await this.prisma.aiSuggestion.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        fieldName: input.fieldName,
        parentTenderId: input.parentTenderId,
        parentLotId: input.parentLotId ?? null,
        proposedValue: input.proposedValue as Prisma.InputJsonValue,
        confidence: input.confidence,
        sourceDocumentId: input.sourceDocumentId ?? null,
        sourceDocumentVersionId: input.sourceDocumentVersionId ?? null,
        sourcePage: input.sourcePage ?? null,
        sourceChunkReference: input.sourceChunkReference ?? null,
        sourceAnalysisAttemptId: input.sourceAnalysisAttemptId ?? null,
        aiProvider: input.aiProvider ?? null,
        aiModel: input.aiModel ?? null,
        status: AiSuggestionStatus.Pending,
        createdByProcess: input.createdByProcess,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });

    return toAiSuggestionRecord(created);
  }

  async findById(input: { id: string; organizationId: string }): Promise<AiSuggestionRecord | null> {
    // V2 Sprint 4 (audit Codex P1-001, round 4) — rejoint la transaction ambiante active
    // (ApplyAiSuggestionUseCase) si présente, voir PrismaService.currentClient().
    const found = await this.prisma.currentClient().aiSuggestion.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
    return found ? toAiSuggestionRecord(found) : null;
  }

  async list(input: {
    organizationId: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
    parentTenderId?: string | undefined;
    status?: string | undefined;
  }): Promise<AiSuggestionRecord[]> {
    const rows = await this.prisma.aiSuggestion.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.parentTenderId ? { parentTenderId: input.parentTenderId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toAiSuggestionRecord);
  }

  async existsForAnalysisAttempt(input: { organizationId: string; sourceAnalysisAttemptId: string }): Promise<boolean> {
    const found = await this.prisma.aiSuggestion.findFirst({
      where: { organizationId: input.organizationId, sourceAnalysisAttemptId: input.sourceAnalysisAttemptId },
      select: { id: true },
    });
    return found !== null;
  }

  async transitionFromPending(
    input: {
      id: string;
      organizationId: string;
      fromStatus?: string | undefined;
      newStatus: string;
      validatedByUserId?: string | undefined;
      validatedAt?: Date | undefined;
      rejectedAt?: Date | undefined;
      decisionReason?: string | undefined;
      conflictResolution?: string | undefined;
      appliedValue?: unknown;
      updatedAt: Date;
    },
    onSuccessTx?: ((tx: PrismaTx) => Promise<void>) | undefined,
  ): Promise<AiSuggestionRecord | null> {
    const data = {
      status: input.newStatus,
      validatedByUserId: input.validatedByUserId ?? null,
      validatedAt: input.validatedAt ?? null,
      rejectedAt: input.rejectedAt ?? null,
      decisionReason: input.decisionReason ?? null,
      ...(input.conflictResolution !== undefined ? { conflictResolution: input.conflictResolution } : {}),
      ...(input.appliedValue !== undefined ? { appliedValue: input.appliedValue as Prisma.InputJsonValue } : {}),
      updatedAt: input.updatedAt,
    };
    const where = { id: input.id, organizationId: input.organizationId, status: input.fromStatus ?? AiSuggestionStatus.Pending };

    // Garde applicative atomique (mission Sprint 1 §3) — équivalent au pattern de concurrence
    // optimiste déjà utilisé ailleurs dans le projet (updateMany + count check), ici gardé par
    // le statut courant (`PENDING` par défaut, voir `fromStatus` — audit Codex P1-001) plutôt que
    // par une colonne `version`.

    // V2 Sprint 4 (audit Codex P1-001, round 4) — une transaction ambiante est déjà active
    // (ApplyAiSuggestionUseCase, via AtomicTransactionRunner) : jamais de transaction imbriquée
    // indépendante, la transition ET son effet de bord rejoignent DIRECTEMENT cette transaction
    // englobante (qui couvre aussi l'écriture métier cible — Tenders/Buyer).
    const ambientTx = TransactionalContext.current();
    if (ambientTx) {
      const result = await ambientTx.aiSuggestion.updateMany({ where, data });
      if (result.count !== 1) {
        return null;
      }
      const updated = await ambientTx.aiSuggestion.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
      if (!updated) {
        return null;
      }
      if (onSuccessTx) {
        await onSuccessTx(ambientTx);
      }
      return toAiSuggestionRecord(updated);
    }

    if (!onSuccessTx) {
      const result = await this.prisma.aiSuggestion.updateMany({ where, data });
      if (result.count !== 1) {
        return null;
      }
      return this.findById({ id: input.id, organizationId: input.organizationId });
    }

    // Audit Codex P1-001 (round 3) — la transition de statut ET ses effets de bord (audit,
    // Outbox) partagent UNE SEULE transaction Postgres courte : jamais un statut changé sans que
    // sa trace d'audit/Outbox le soit aussi, jamais l'inverse. (Chemin emprunté par un appelant
    // direct d'Accept/Modify/Reject HORS du bridge, ex. décision manuelle via l'API — pas de
    // transaction ambiante à rejoindre dans ce cas.)
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.aiSuggestion.updateMany({ where, data });
      if (result.count !== 1) {
        return null;
      }
      const updated = await tx.aiSuggestion.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
      if (!updated) {
        return null;
      }
      await onSuccessTx(tx);
      return toAiSuggestionRecord(updated);
    });
  }
}
