import { beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../../analysis";
import {
  AiBenchmarkPermissionMissingError,
  BenchmarkSuiteEmptyError,
  BenchmarkSuiteNotDraftError,
  BenchmarkSuiteNotFoundError,
} from "../../domain/errors";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryBenchmarkCaseRepository,
  InMemoryBenchmarkSuiteRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { AddBenchmarkCaseUseCase } from "./add-benchmark-case.use-case";
import { CreateBenchmarkSuiteUseCase } from "./create-benchmark-suite.use-case";
import { CreateNextBenchmarkSuiteVersionUseCase } from "./create-next-benchmark-suite-version.use-case";
import { GetBenchmarkSuiteUseCase } from "./get-benchmark-suite.use-case";
import { ListBenchmarkSuitesUseCase } from "./list-benchmark-suites.use-case";
import { PublishBenchmarkSuiteUseCase } from "./publish-benchmark-suite.use-case";

describe("Benchmark suite lifecycle (create → add cases → publish → new version)", () => {
  let suiteRepository: InMemoryBenchmarkSuiteRepository;
  let caseRepository: InMemoryBenchmarkCaseRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let clock: FixedClock;
  let createSuiteUseCase: CreateBenchmarkSuiteUseCase;
  let nextVersionUseCase: CreateNextBenchmarkSuiteVersionUseCase;
  let addCaseUseCase: AddBenchmarkCaseUseCase;
  let publishUseCase: PublishBenchmarkSuiteUseCase;
  let listUseCase: ListBenchmarkSuitesUseCase;
  let getUseCase: GetBenchmarkSuiteUseCase;

  beforeEach(() => {
    suiteRepository = new InMemoryBenchmarkSuiteRepository();
    caseRepository = new InMemoryBenchmarkCaseRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clock = new FixedClock();
    // Un seul générateur d'ids partagé entre tous les use cases — sinon deux use cases distincts
    // génèrent chacun "id-1" en premier, provoquant une collision d'id entre une suite et sa
    // nouvelle version dans le Map en mémoire (bug détecté par ce test lui-même).
    const idGenerator = new SequentialIdGenerator();
    createSuiteUseCase = new CreateBenchmarkSuiteUseCase(suiteRepository, auditLogWriter, clock, idGenerator);
    nextVersionUseCase = new CreateNextBenchmarkSuiteVersionUseCase(suiteRepository, auditLogWriter, clock, idGenerator);
    addCaseUseCase = new AddBenchmarkCaseUseCase(suiteRepository, caseRepository, auditLogWriter, clock, idGenerator);
    publishUseCase = new PublishBenchmarkSuiteUseCase(suiteRepository, caseRepository, auditLogWriter, clock);
    listUseCase = new ListBenchmarkSuitesUseCase(suiteRepository, caseRepository);
    getUseCase = new GetBenchmarkSuiteUseCase(suiteRepository, caseRepository);
  });

  it("creates a suite, adds a case, and publishes it once non-empty", async () => {
    const suite = await createSuiteUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      name: "Golden dataset — dates",
      promptKey: PromptKey.AnalyzeDocument,
    });
    expect(suite.status).toBe("DRAFT");

    await expect(
      publishUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", suiteId: suite.id }),
    ).rejects.toBeInstanceOf(BenchmarkSuiteEmptyError);

    await addCaseUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      suiteId: suite.id,
      inputVariables: { text: "La date limite est le 30 septembre 2026." },
      expectedOutput: { submissionDeadline: "2026-09-30T12:00:00+02:00" },
      difficulty: "EASY",
      language: "FR",
      businessCategory: "DEADLINE",
    });

    const published = await publishUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      suiteId: suite.id,
    });
    expect(published.status).toBe("PUBLISHED");
    expect(published.caseCount).toBe(1);
  });

  it("refuses to add a case to a published suite", async () => {
    const suite = await createSuiteUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      name: "x",
      promptKey: PromptKey.AnalyzeDocument,
    });
    await addCaseUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      suiteId: suite.id,
      inputVariables: {},
      expectedOutput: {},
      difficulty: "EASY",
      language: "FR",
    });
    await publishUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", suiteId: suite.id });

    await expect(
      addCaseUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId: suite.id,
        inputVariables: {},
        expectedOutput: {},
        difficulty: "EASY",
        language: "FR",
      }),
    ).rejects.toBeInstanceOf(BenchmarkSuiteNotDraftError);
  });

  it("creates a new DRAFT version distinct from the published one, listable and gettable independently", async () => {
    const suite = await createSuiteUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      name: "x",
      promptKey: PromptKey.AnalyzeDocument,
    });
    await addCaseUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      suiteId: suite.id,
      inputVariables: {},
      expectedOutput: {},
      difficulty: "EASY",
      language: "FR",
    });
    await publishUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", suiteId: suite.id });

    const v2 = await nextVersionUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      suiteId: suite.id,
    });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("DRAFT");

    const all = await listUseCase.execute({ actorRole: "READ_ONLY" });
    expect(all).toHaveLength(2);

    const v1Reloaded = await getUseCase.execute({ actorRole: "READ_ONLY", suiteId: suite.id });
    expect(v1Reloaded.suite.status).toBe("PUBLISHED");
    expect(v1Reloaded.cases).toHaveLength(1);
  });

  it("throws BenchmarkSuiteNotFoundError for an unknown suite id", async () => {
    await expect(getUseCase.execute({ actorRole: "READ_ONLY", suiteId: "unknown" })).rejects.toBeInstanceOf(BenchmarkSuiteNotFoundError);
  });

  it("refuses a non-admin actor attempting to create/publish/add a case", async () => {
    await expect(
      createSuiteUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        name: "x",
        promptKey: PromptKey.AnalyzeDocument,
      }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });
});
