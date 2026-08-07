import { describe, expect, it } from "vitest";
import type { CompanyProfileSummary, GetCompanyProfileUseCase } from "../../../company-profile";
import type { DceDocumentSummary } from "../../../dce";
import { DceNotFoundError, type ListDceDocumentsUseCase } from "../../../dce";
import type {
  EffectiveTenderAnalysisSummary,
  GetEffectiveTenderAnalysisSummaryUseCase,
  ListTenderClausesUseCase,
  ListTenderCriteriaUseCase,
  ListTenderRequirementsUseCase,
  ListTenderRisksUseCase,
} from "../../../analysis";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import type { AiSuggestionSummary, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { GetTenderUseCase, TenderPermissionMissingError } from "../../../tenders";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  InMemoryRequestedDocumentRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../../tenders/test-support/fakes";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryGoNoGoReportRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { GenerateGoNoGoReportUseCase } from "./generate-go-no-go-report.use-case";

const ORG = "org-1";
const TENDER_ID = "tender-1";

function analysisSummary(overrides: Partial<EffectiveTenderAnalysisSummary> = {}): EffectiveTenderAnalysisSummary {
  return {
    id: "summary-1",
    analysisVersion: 3,
    opportunitySummary: "Marché de nettoyage de bureaux.",
    complexityLevel: "MEDIUM",
    mainCriteria: [],
    mainRisks: [],
    mainObligations: [],
    missingElements: [],
    pointsToClarify: [],
    conflicts: undefined,
    goNoGoRecommendation: "GO",
    goNoGoRationale: "Dossier complet.",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasUserRevision: false,
    ...overrides,
  };
}

function emptyCompanyProfileSummary(): CompanyProfileSummary {
  return {
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    legalIdentity: null,
    representatives: [],
    bankAccounts: [],
    insurances: [],
    certifications: [],
    references: [],
    humanResources: [],
    materialResources: [],
    documents: [],
    completeness: { identity: "MISSING", banking: "MISSING", insurances: "MISSING", certifications: "MISSING", references: "MISSING", resources: "MISSING", documents: "MISSING" },
  };
}

class FakeEffectiveAnalysisUseCase {
  constructor(private readonly result: EffectiveTenderAnalysisSummary | Error) {}
  async execute(): Promise<EffectiveTenderAnalysisSummary> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeFindingsUseCase<T> {
  constructor(private readonly items: readonly T[] = []) {}
  async execute(): Promise<{ items: readonly T[]; total: number; limit: number; offset: number }> {
    return { items: this.items, total: this.items.length, limit: 1000, offset: 0 };
  }
}

class FakeListAiSuggestionsUseCase {
  constructor(private readonly items: readonly AiSuggestionSummary[] = []) {}
  async execute(): Promise<AiSuggestionSummary[]> {
    return [...this.items];
  }
}

class FakeListDceDocumentsUseCase {
  constructor(private readonly result: readonly DceDocumentSummary[] | Error = []) {}
  async execute(): Promise<DceDocumentSummary[]> {
    if (this.result instanceof Error) throw this.result;
    return [...this.result];
  }
}

class FakeGetCompanyProfileUseCase {
  constructor(private readonly summary: CompanyProfileSummary = emptyCompanyProfileSummary()) {}
  async execute(): Promise<CompanyProfileSummary> {
    return this.summary;
  }
}

async function buildHarness(options: { analysis?: EffectiveTenderAnalysisSummary | Error; dce?: readonly DceDocumentSummary[] | Error } = {}) {
  const reportRepository = new InMemoryGoNoGoReportRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const requestedDocumentRepository = new InMemoryRequestedDocumentRepository();
  const tenderLotRepository = new InMemoryTenderLotRepository();
  const tenderRepository = new InMemoryTenderRepository();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);

  const tender = Tender.create({
    id: TenderId.from(TENDER_ID),
    organizationId: ORG,
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
  await tenderRepository.seed(tender);

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, clientPortfolio.assertClientAccessUseCase);

  const useCase = new GenerateGoNoGoReportUseCase(
    reportRepository,
    auditLogWriter,
    outboxWriter,
    requestedDocumentRepository,
    tenderLotRepository,
    new FixedClock(),
    new SequentialIdGenerator(),
    getTenderUseCase,
    clientPortfolio.assertClientAccessUseCase,
    new FakeEffectiveAnalysisUseCase(options.analysis ?? analysisSummary()) as unknown as GetEffectiveTenderAnalysisSummaryUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderRequirementsUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderCriteriaUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderRisksUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderClausesUseCase,
    new FakeListAiSuggestionsUseCase() as unknown as ListAiSuggestionsUseCase,
    new FakeListDceDocumentsUseCase(options.dce ?? []) as unknown as ListDceDocumentsUseCase,
    new FakeGetCompanyProfileUseCase() as unknown as GetCompanyProfileUseCase,
  );

  return { reportRepository, auditLogWriter, outboxWriter, useCase };
}

describe("GenerateGoNoGoReportUseCase", () => {
  it("generates a new GoNoGoReport version when a DCE analysis has already succeeded", async () => {
    const { useCase, reportRepository } = await buildHarness();

    const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.reportVersion).toBe(1);
    expect(record.analysisVersion).toBe(3);
    const versions = await reportRepository.listVersions({ organizationId: ORG, tenderId: TENDER_ID });
    expect(versions).toHaveLength(1);
  });

  it("propagates TenderBusinessAnalysisNotFoundError when no DCE analysis has succeeded yet (Level-2 gate)", async () => {
    const { useCase } = await buildHarness({ analysis: new TenderBusinessAnalysisNotFoundError() });

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(TenderBusinessAnalysisNotFoundError);
  });

  it("falls back to a DCE document count of 0 when no DCE exists yet, rather than failing the whole report", async () => {
    const { useCase } = await buildHarness({ dce: new DceNotFoundError() });

    const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.documentaryLoad).toBeDefined();
  });

  it("refuses when the actor lacks tender:manage_go_no_go (e.g. CONTRIBUTOR)", async () => {
    const { useCase } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "CONTRIBUTOR" })).rejects.toThrow(TenderPermissionMissingError);
  });

  it("creates a new version on each regeneration, never overwriting the previous one (append-only)", async () => {
    const { useCase, reportRepository } = await buildHarness();

    await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });
    const second = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(second.reportVersion).toBe(2);
    const versions = await reportRepository.listVersions({ organizationId: ORG, tenderId: TENDER_ID });
    expect(versions).toHaveLength(2);
  });

  it("records an audit entry and a GoNoGoReportGenerated outbox event", async () => {
    const { useCase, auditLogWriter, outboxWriter } = await buildHarness();

    await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(auditLogWriter.entries[0]?.action).toBe("opportunity.go_no_go_report_generated");
    expect(outboxWriter.writes[0]?.events[0]?.eventType).toBe("GoNoGoReportGenerated");
  });
});
