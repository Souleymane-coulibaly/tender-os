import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CompleteRoutingDecisionInput,
  CreateRoutingDecisionInput,
  RoutingDecisionWriter,
} from "../../analysis/application/ports/routing-decision-writer";

/**
 * Implémentation du port `RoutingDecisionWriter` DÉFINI PAR `analysis` (audit Codex P1-4) — écrit
 * dans `routing_decisions`, une table PARTAGÉE au niveau du schéma Prisma (pas d'appartenance
 * NestJS stricte) mais dont l'implémentation vit ici, aux côtés du reste du bridge ai-benchmark →
 * analysis, exactement comme `PrismaRoutingPolicyResolver`.
 */
@Injectable()
export class PrismaRoutingDecisionWriter implements RoutingDecisionWriter {
  private readonly logger = new Logger(PrismaRoutingDecisionWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    const clientAccountId = await this.resolveClientAccountId(input.tenderId);

    await this.prisma.routingDecision.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        clientAccountId: clientAccountId ?? null,
        tenderId: input.tenderId ?? null,
        analysisId: input.analysisId,
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
        actualCostAmount: input.actualCostAmount ?? null,
        currency: input.currency ?? null,
        latencyMs: input.latencyMs ?? null,
        status: input.status,
        failureReason: input.failureReason ?? null,
        completedAt: input.occurredAt,
      },
    });
  }

  /** Best-effort (audit Codex P1-4 §"clientAccountId si applicable") — une lecture directe, en
   *  lecture seule, de `Tender.clientAccountId` (Sprint 5.1) : ai-benchmark ne dépend d'aucun
   *  module client-portfolio, seulement du client Prisma déjà partagé par toute l'application.
   *  Ne doit jamais faire échouer la création de la décision elle-même. */
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
