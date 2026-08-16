import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CompleteRoutingDecisionInput,
  CreateRoutingDecisionInput,
  RoutingDecisionWriter,
} from "../../chat/application/ports/routing-decision-writer";

/**
 * Consolidation IA — Checkpoint D. Implémentation du port `RoutingDecisionWriter` DÉFINI PAR `chat`
 * — écrit dans `routing_decisions` (table partagée avec Analyse/Génération : `conversationId`
 * renseigné, `analysisId`/`generationId`/`technicalMemoSectionId` laissés `null` — voir la
 * contrainte CHECK `routing_decisions_exactly_one_target_check`, migration Checkpoint D). Vit ici,
 * aux côtés de `PrismaRoutingDecisionWriter` (Analyse)/`PrismaGenerationRoutingDecisionWriter`
 * (Génération)/`PrismaRoutingPolicyResolver` — même bridge ai-benchmark → consommateur. Aucun calcul
 * de coût réel (contrairement à Génération) : Chat ne possède aucune notion de tarif par appel
 * aujourd'hui, `actualCostAmount`/`currency` restent toujours `null`.
 */
@Injectable()
export class PrismaChatRoutingDecisionWriter implements RoutingDecisionWriter {
  private readonly logger = new Logger(PrismaChatRoutingDecisionWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    const clientAccountId = await this.resolveClientAccountId(input.tenderId);

    await this.prisma.routingDecision.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        clientAccountId: clientAccountId ?? null,
        tenderId: input.tenderId ?? null,
        conversationId: input.conversationId,
        promptKey: input.promptKey,
        routingPolicyId: input.routingPolicyId ?? null,
        routingPolicyVersion: input.routingPolicyVersion ?? null,
        primaryProvider: input.primaryProvider,
        primaryModel: input.primaryModel,
        status: "IN_PROGRESS",
        createdAt: input.occurredAt,
      },
    });
  }

  async complete(input: CompleteRoutingDecisionInput): Promise<void> {
    await this.prisma.routingDecision.update({
      where: { id: input.id },
      data: {
        selectedProvider: input.selectedProvider ?? null,
        selectedModel: input.selectedModel ?? null,
        fallbackLevel: input.fallbackLevel,
        fallbackAttempts: input.fallbackAttempts,
        inputTokenCount: input.inputTokenCount ?? null,
        outputTokenCount: input.outputTokenCount ?? null,
        latencyMs: input.latencyMs ?? null,
        status: input.status,
        failureReason: input.failureReason ?? null,
        completedAt: input.occurredAt,
      },
    });
  }

  /** Best-effort — même motif que `PrismaRoutingDecisionWriter` (Analyse) : une lecture directe, en
   *  lecture seule, de `Tender.clientAccountId`. Ne doit jamais faire échouer la création de la
   *  décision elle-même. */
  private async resolveClientAccountId(tenderId: string | undefined): Promise<string | undefined> {
    if (!tenderId) return undefined;
    try {
      const tender = await this.prisma.tender.findUnique({ where: { id: tenderId }, select: { clientAccountId: true } });
      return tender?.clientAccountId ?? undefined;
    } catch (error) {
      this.logger.warn(`Could not resolve clientAccountId for tender ${tenderId}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}
