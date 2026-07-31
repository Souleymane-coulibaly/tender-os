import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkSuiteNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkSuiteSummary, type BenchmarkSuiteSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type CreateNextBenchmarkSuiteVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  suiteId: string;
  requestId?: string | undefined;
}>;

/** Nouvelle version DRAFT d'une suite existante (Sprint 5.2 §"les cas sont immuables une fois
 *  publiés — toute évolution crée une nouvelle version") — jamais une mutation de la version
 *  précédente, qui reste PUBLISHED et inchangée, référencée telle quelle par tout `BenchmarkRun`
 *  déjà lancé contre elle. */
@Injectable()
export class CreateNextBenchmarkSuiteVersionUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateNextBenchmarkSuiteVersionCommand): Promise<BenchmarkSuiteSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const previous = await this.benchmarkSuiteRepository.findById({ id: command.suiteId });
    if (!previous) {
      throw new BenchmarkSuiteNotFoundError();
    }

    const nextVersion = previous.nextDraftVersion({
      id: this.idGenerator.generate(),
      createdByUserId: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.benchmarkSuiteRepository.create(nextVersion);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_suite.new_version_created",
      resourceType: "benchmark_suite",
      resourceId: nextVersion.id,
      requestId: command.requestId,
      metadata: { name: nextVersion.name, version: nextVersion.version, previousSuiteId: previous.id },
    });

    return toBenchmarkSuiteSummary(nextVersion, 0);
  }
}
