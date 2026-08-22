import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAnalysisInput, GetDocumentAnalysisInputUseCase } from "../../../extraction";
import { AnalysisPermissionMissingError } from "../../domain/errors";
import {
  FakeOutboxWriter,
  FixedClock,
  InMemoryAnalysisJobRepository,
  InMemoryAuditLogWriter,
  RecordingAnalysisDispatcher,
} from "../../test-support/fakes";
import { StartDocumentAnalysisUseCase } from "./start-document-analysis.use-case";

const ORG = "11111111-1111-1111-1111-111111111111";
const TENDER = "22222222-2222-2222-2222-222222222222";
const DOCUMENT = "33333333-3333-3333-3333-333333333333";
const DCE = "44444444-4444-4444-4444-444444444444";
const NOW = new Date("2026-07-29T14:00:00Z");

function fakeInput(overrides?: Partial<DocumentAnalysisInput>): DocumentAnalysisInput {
  return {
    organizationId: ORG,
    tenderId: TENDER,
    dceId: DCE,
    documentId: DOCUMENT,
    documentVersionId: "document-version-1",
    documentName: "cctp.pdf",
    documentType: "TECHNICAL",
    extractionId: DOCUMENT,
    extractionStatus: "SUCCEEDED",
    extractionVersion: 1,
    partial: false,
    warnings: [],
    chunks: [{ sequence: 0, content: "hello", characterCount: 5, checksum: "chk-0" }],
    ...overrides,
  };
}

describe("StartDocumentAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let dispatcher: RecordingAnalysisDispatcher;
  let clock: FixedClock;
  let getDocumentAnalysisInputUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    dispatcher = new RecordingAnalysisDispatcher();
    clock = new FixedClock(NOW);
    getDocumentAnalysisInputUseCase = { execute: vi.fn(async () => fakeInput()) };
  });

  function buildUseCase(): StartDocumentAnalysisUseCase {
    return new StartDocumentAnalysisUseCase(
      jobRepository,
      auditLogWriter,
      dispatcher,
      new FakeOutboxWriter(),
      clock,
      getDocumentAnalysisInputUseCase as unknown as GetDocumentAnalysisInputUseCase,
      { canOperateOnTender: vi.fn(async () => true), runTenderOperationEntitled: vi.fn(async (_i: unknown, op: () => Promise<unknown>) => op()) } as never,
    );
  }

  it("creates a QUEUED job version 1, audits and dispatches it", async () => {
    const useCase = buildUseCase();
    const result = await useCase.execute({
      organizationId: ORG,
      tenderId: TENDER,
      documentId: DOCUMENT,
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
    });

    expect(result.status).toBe("QUEUED");
    expect(result.scope).toBe("DOCUMENT");
    expect(result.analysisVersion).toBe(1);
    expect(result.extractionVersion).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]!.action).toBe("analysis.requested");
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0]!.jobId).toBe(result.id);
  });

  it("rejects a role without Trigger permission", async () => {
    const useCase = buildUseCase();
    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorId: "u", actorRole: "READ_ONLY" }),
    ).rejects.toBeInstanceOf(AnalysisPermissionMissingError);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it("refuses a double trigger while a job is still active for the same document", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorId: "u", actorRole: "CONTRIBUTOR" });

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorId: "u", actorRole: "CONTRIBUTOR" }),
    ).rejects.toMatchObject({ code: "ANALYSIS_ALREADY_RUNNING" });
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it("creates version 2 once the previous job for the same document reached a terminal status", async () => {
    const useCase = buildUseCase();
    const first = await useCase.execute({
      organizationId: ORG,
      tenderId: TENDER,
      documentId: DOCUMENT,
      actorId: "u",
      actorRole: "CONTRIBUTOR",
    });

    // Simule la fin (terminal) du premier job sans passer par ProcessAnalysisJobUseCase — seul le
    // statut compte pour la garde "double déclenchement".
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: first.id });
    stored!.reserve(NOW);
    stored!.complete({ outcome: "SUCCEEDED", provider: "FAKE", model: "m", durationMs: 1 }, NOW);
    await jobRepository.save(stored!);

    const second = await useCase.execute({
      organizationId: ORG,
      tenderId: TENDER,
      documentId: DOCUMENT,
      actorId: "u",
      actorRole: "CONTRIBUTOR",
    });
    expect(second.analysisVersion).toBe(2);
    expect(second.id).not.toBe(first.id);
  });
});
