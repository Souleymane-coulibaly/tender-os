import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import type { PromptKey } from "../../../analysis";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkSuiteSummary, type BenchmarkSuiteSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type CreateBenchmarkSuiteCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  name: string;
  promptKey: PromptKey;
  description?: string | undefined;
  requestId?: string | undefined;
}>;

/** Crée la version 1 (DRAFT) d'une nouvelle suite (Sprint 5.2 §"Corpus de benchmark") — un nom de
 *  suite déjà utilisé passe par `CreateNextBenchmarkSuiteVersionUseCase`, jamais ici (une nouvelle
 *  ligne de version 1 avec un nom déjà pris serait ambiguë pour `findLatestVersionByName`). */
@Injectable()
export class CreateBenchmarkSuiteUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateBenchmarkSuiteCommand): Promise<BenchmarkSuiteSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const suite = BenchmarkSuite.create({
      id: this.idGenerator.generate(),
      name: command.name,
      promptKey: command.promptKey,
      description: command.description,
      createdByUserId: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.benchmarkSuiteRepository.create(suite);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_suite.created",
      resourceType: "benchmark_suite",
      resourceId: suite.id,
      requestId: command.requestId,
      metadata: { name: suite.name, version: suite.version, promptKey: suite.promptKey },
    });

    return toBenchmarkSuiteSummary(suite, 0);
  }
}
