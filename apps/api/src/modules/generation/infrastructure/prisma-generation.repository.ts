import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  FinalizeGenerationOutcome,
  GenerationListResult,
  GenerationRepository,
  GenerationReservationOutcome,
  ListGenerationsByTenderQuery,
} from "../application/ports/generation.repository";
import { GenerationAlreadyRunningError } from "../domain/errors";
import { Generation } from "../domain/generation.aggregate";
import { GenerationStatus } from "../domain/generation-status";
import type { GenerationTaskType } from "../domain/generation-task-type";
import { toDomain, toPersistence } from "./generation.persistence-mapper";

const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;
const IN_FLIGHT_STATUSES = [GenerationStatus.Pending, GenerationStatus.Generating];

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaGenerationRepository implements GenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; generationId: string }): Promise<Generation | null> {
    const record = await this.prisma.generation.findFirst({ where: { id: input.generationId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findByRoot(input: { organizationId: string; rootGenerationId: string }): Promise<readonly Generation[]> {
    const records = await this.prisma.generation.findMany({
      where: { organizationId: input.organizationId, rootGenerationId: input.rootGenerationId },
      orderBy: { version: "asc" },
    });
    return records.map(toDomain);
  }

  async listByTender(query: ListGenerationsByTenderQuery): Promise<GenerationListResult> {
    // Une ligne par fil (la dernière version) — pas d'agrégation SQL dédiée pour rester simple
    // (mission "ne construis pas d'infra complexe si non nécessaire") : on charge tout le fil
    // trié, on garde la dernière par rootGenerationId. Les tenders ont un nombre borné de
    // générations dans cette tranche ; à revisiter seulement si le profilage l'exige.
    const all = await this.prisma.generation.findMany({
      where: {
        organizationId: query.organizationId,
        tenderId: query.tenderId,
        ...(query.taskType ? { taskType: query.taskType } : {}),
      },
      orderBy: { version: "asc" },
    });

    const latestPerRoot = new Map<string, (typeof all)[number]>();
    for (const record of all) {
      const current = latestPerRoot.get(record.rootGenerationId);
      if (!current || record.version > current.version) latestPerRoot.set(record.rootGenerationId, record);
    }
    const items = [...latestPerRoot.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { items: items.slice(query.offset, query.offset + query.limit).map(toDomain), total: items.length };
  }

  async findInFlightForTarget(input: {
    organizationId: string;
    tenderId: string;
    taskType: GenerationTaskType;
    targetRef?: string | undefined;
  }): Promise<Generation | null> {
    const record = await this.prisma.generation.findFirst({
      where: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        taskType: input.taskType,
        targetRef: input.targetRef ?? null,
        status: { in: IN_FLIGHT_STATUSES },
      },
    });
    return record ? toDomain(record) : null;
  }

  /** Traduit une violation réelle de l'index unique partiel
   *  `generations_org_tender_tasktype_target_inflight_key` (course de concurrence ayant dépassé la
   *  vérification applicative `findInFlightForTarget`, elle-même première ligne de défense) en
   *  `GenerationAlreadyRunningError` explicite — jamais une exception Prisma brute remontée à
   *  l'appelant (même motif que `PrismaPromptVersionRepository.activateAtomically`). */
  async create(generation: Generation): Promise<void> {
    try {
      await this.prisma.generation.create({ data: toPersistence(generation) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new GenerationAlreadyRunningError();
      }
      throw error;
    }
  }

  async save(generation: Generation): Promise<void> {
    const data = toPersistence(generation);
    await this.prisma.generation.update({ where: { id: data.id }, data });
  }

  /** Phase 1 — réservation atomique courte, même motif que
   *  `PrismaAnalysisJobRepository.reserveForProcessing` (verrou consultatif Postgres scopé à la
   *  génération, tenu seulement le temps de cette réservation). */
  async reserveForGenerating(input: { organizationId: string; generationId: string; occurredAt: Date }): Promise<GenerationReservationOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.generationId}))`;

      const record = await tx.generation.findFirst({ where: { id: input.generationId, organizationId: input.organizationId } });
      if (!record) {
        return { kind: "not_startable", status: GenerationStatus.Cancelled };
      }

      const generation = toDomain(record);
      if (generation.status !== GenerationStatus.Pending) {
        return { kind: "not_startable", status: generation.status };
      }

      generation.reserve();
      await tx.generation.update({ where: { id: record.id }, data: toPersistence(generation) });

      return { kind: "reserved", generation };
    }, SHORT_TX_OPTIONS);
  }

  /** Phase 3 — finalisation atomique courte, compare-and-set sur `attemptCount` — même motif que
   *  `PrismaAnalysisJobRepository.finalizeAttempt`. Contrairement à Analysis, aucune table de
   *  résultat séparée : tout est écrit directement sur la ligne `Generation` en une seule
   *  `updateMany` conditionnelle. */
  async finalizeGeneration(input: {
    organizationId: string;
    generationId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeGenerationOutcome;
  }): Promise<{ applied: boolean }> {
    const outcome = input.outcome;

    const data =
      outcome.kind === "generated"
        ? {
            status: GenerationStatus.Generated,
            routingPolicyId: outcome.routingPolicyId ?? null,
            routingPolicyVersion: outcome.routingPolicyVersion ?? null,
            routingDecisionId: outcome.routingDecisionId ?? null,
            modelProvider: outcome.modelProvider,
            modelKey: outcome.modelKey,
            fallbackLevel: outcome.fallbackLevel,
            generatedContent: outcome.generatedContent ?? null,
            structuredContent:
              outcome.structuredContent === undefined ? Prisma.DbNull : (outcome.structuredContent as Prisma.InputJsonValue),
            inputTokenCount: outcome.inputTokenCount ?? null,
            outputTokenCount: outcome.outputTokenCount ?? null,
            totalTokenCount: outcome.totalTokenCount ?? null,
            estimatedCostAmount: outcome.estimatedCostAmount ?? null,
            currency: outcome.currency ?? null,
            latencyMs: outcome.latencyMs,
            completedAt: input.occurredAt,
            errorCode: null,
            errorMessage: null,
          }
        : {
            status: GenerationStatus.Failed,
            routingPolicyId: outcome.routingPolicyId ?? null,
            routingPolicyVersion: outcome.routingPolicyVersion ?? null,
            routingDecisionId: outcome.routingDecisionId ?? null,
            modelProvider: outcome.modelProvider ?? null,
            modelKey: outcome.modelKey ?? null,
            completedAt: input.occurredAt,
            errorCode: outcome.errorCode,
            errorMessage: outcome.errorMessage,
          };

    const result = await this.prisma.generation.updateMany({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        attemptCount: input.expectedAttemptCount,
        status: GenerationStatus.Generating,
      },
      data,
    });

    return { applied: result.count > 0 };
  }
}
