import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkCase } from "../../domain/benchmark-case.entity";
import type { BenchmarkBusinessCategory, BenchmarkDifficulty, BenchmarkLanguage } from "../../domain/benchmark-difficulty";
import { BenchmarkSuiteNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkCaseSummary, type BenchmarkCaseSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type AddBenchmarkCaseCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  suiteId: string;
  inputVariables: Readonly<Record<string, string>>;
  expectedOutput: unknown;
  expectedProvenance?: unknown | undefined;
  difficulty: BenchmarkDifficulty;
  language: BenchmarkLanguage;
  businessCategory?: BenchmarkBusinessCategory | undefined;
  requestId?: string | undefined;
}>;

/** Un cas ne peut être ajouté qu'à une suite encore DRAFT (`BenchmarkSuite.assertMutable`) —
 *  jamais à une version déjà PUBLISHED (mission §"les cas sont immuables une fois publiés"). */
@Injectable()
export class AddBenchmarkCaseUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddBenchmarkCaseCommand): Promise<BenchmarkCaseSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const suite = await this.benchmarkSuiteRepository.findById({ id: command.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }
    suite.assertMutable();

    const benchmarkCase = BenchmarkCase.create({
      id: this.idGenerator.generate(),
      suiteId: command.suiteId,
      inputVariables: command.inputVariables,
      expectedOutput: command.expectedOutput,
      expectedProvenance: command.expectedProvenance,
      difficulty: command.difficulty,
      language: command.language,
      businessCategory: command.businessCategory,
      occurredAt: this.clock.now(),
    });

    await this.benchmarkCaseRepository.create(benchmarkCase);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_case.added",
      resourceType: "benchmark_case",
      resourceId: benchmarkCase.id,
      requestId: command.requestId,
      metadata: { suiteId: command.suiteId, difficulty: benchmarkCase.difficulty },
    });

    return toBenchmarkCaseSummary(benchmarkCase);
  }
}
