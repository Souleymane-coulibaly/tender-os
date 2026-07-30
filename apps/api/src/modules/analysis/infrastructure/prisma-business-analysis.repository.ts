import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  BusinessAnalysisRepository,
  ClauseFindingRecord,
  CriterionFindingRecord,
  DeadlineFindingRecord,
  DocumentAnalysisRecord,
  ListPage,
  PageResult,
  PersistDocumentAnalysisInput,
  PersistTenderConsolidationInput,
  PrismaTx,
  QuestionFindingRecord,
  RequirementFindingRecord,
  RiskFindingRecord,
  TenderAnalysisSummaryRecord,
} from "../application/ports/business-analysis.repository";

@Injectable()
export class PrismaBusinessAnalysisRepository implements BusinessAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async persistDocumentAnalysis(tx: PrismaTx, input: PersistDocumentAnalysisInput): Promise<void> {
    const { output } = input;
    await tx.documentBusinessAnalysis.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        analysisJobId: input.analysisJobId,
        analysisVersion: input.analysisVersion,
        tenderId: input.tenderId,
        dceId: input.dceId,
        documentId: input.documentId,
        extractionVersion: input.extractionVersion,
        documentType: output.documentType,
        language: output.language,
        metadata: output.metadata as unknown as Prisma.InputJsonValue,
        deadlines: output.deadlines as unknown as Prisma.InputJsonValue,
        criteria: output.criteria as unknown as Prisma.InputJsonValue,
        requirements: output.requirements as unknown as Prisma.InputJsonValue,
        clauses: output.clauses as unknown as Prisma.InputJsonValue,
        warnings: output.warnings,
      },
    });
  }

  async persistTenderConsolidation(tx: PrismaTx, input: PersistTenderConsolidationInput): Promise<void> {
    const { output } = input;
    const base = {
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      analysisJobId: input.analysisJobId,
      analysisVersion: input.analysisVersion,
    };

    if (output.deadlines.length > 0) {
      await tx.tenderDeadlineFinding.createMany({
        data: output.deadlines.map((item) => ({
          id: randomUUID(),
          ...base,
          kind: item.kind,
          label: item.label,
          date: item.date ? new Date(item.date) : null,
          rawText: item.rawText ?? null,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    if (output.criteria.length > 0) {
      await tx.tenderCriterionFinding.createMany({
        data: output.criteria.map((item) => ({
          id: randomUUID(),
          ...base,
          name: item.name,
          weight: item.weight ?? null,
          subCriteria: (item.subCriteria as unknown as Prisma.InputJsonValue) ?? undefined,
          scoringMethod: item.scoringMethod ?? null,
          priceFormula: item.priceFormula ?? null,
          threshold: item.threshold ?? null,
          isEliminatory: item.isEliminatory,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    if (output.requirements.length > 0) {
      await tx.tenderRequirementFinding.createMany({
        data: output.requirements.map((item) => ({
          id: randomUUID(),
          ...base,
          category: item.category,
          label: item.label,
          expectedFormat: item.expectedFormat ?? null,
          isMandatory: item.isMandatory,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    if (output.clauses.length > 0) {
      await tx.tenderClauseFinding.createMany({
        data: output.clauses.map((item) => ({
          id: randomUUID(),
          ...base,
          category: item.category,
          summary: item.summary,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    if (output.risks.length > 0) {
      await tx.tenderRiskFinding.createMany({
        data: output.risks.map((item) => ({
          id: randomUUID(),
          ...base,
          title: item.title,
          category: item.category,
          severity: item.severity,
          probability: item.probability ?? null,
          explanation: item.explanation,
          recommendation: item.recommendation,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    if (output.questions.length > 0) {
      await tx.tenderQuestionFinding.createMany({
        data: output.questions.map((item) => ({
          id: randomUUID(),
          ...base,
          question: item.question,
          justification: item.justification,
          priority: item.priority,
          theme: item.theme,
          documentId: item.documentId ?? null,
          chunkSequence: item.chunkSequence ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
          sheetName: item.sheetName ?? null,
          sectionTitle: item.sectionTitle ?? null,
          citation: item.citation ?? null,
          isInferred: item.isInferred,
          confidence: item.confidence,
        })),
      });
    }

    await tx.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        ...base,
        opportunitySummary: output.summary.opportunitySummary,
        complexityLevel: output.summary.complexityLevel,
        mainCriteria: output.summary.mainCriteria as unknown as Prisma.InputJsonValue,
        mainRisks: output.summary.mainRisks as unknown as Prisma.InputJsonValue,
        mainObligations: output.summary.mainObligations as unknown as Prisma.InputJsonValue,
        missingElements: output.summary.missingElements as unknown as Prisma.InputJsonValue,
        pointsToClarify: output.summary.pointsToClarify as unknown as Prisma.InputJsonValue,
        conflicts: output.summary.conflicts as unknown as Prisma.InputJsonValue,
        goNoGoRecommendation: output.summary.goNoGoRecommendation,
        goNoGoRationale: output.summary.goNoGoRationale,
      },
    });
  }

  async findLatestDocumentAnalyses(input: { organizationId: string; tenderId: string }): Promise<DocumentAnalysisRecord[]> {
    const records = await this.prisma.documentBusinessAnalysis.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: [{ documentId: "asc" }, { analysisVersion: "desc" }],
      distinct: ["documentId"],
    });

    return records.map((record) => ({
      documentId: record.documentId,
      analysisVersion: record.analysisVersion,
      documentType: record.documentType,
      language: record.language,
      metadata: record.metadata as DocumentAnalysisRecord["metadata"],
      deadlines: record.deadlines as DocumentAnalysisRecord["deadlines"],
      criteria: record.criteria as DocumentAnalysisRecord["criteria"],
      requirements: record.requirements as DocumentAnalysisRecord["requirements"],
      clauses: record.clauses as DocumentAnalysisRecord["clauses"],
      warnings: record.warnings,
    }));
  }

  async listDeadlines(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<DeadlineFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderDeadlineFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderDeadlineFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        kind: record.kind,
        label: record.label,
        date: record.date?.toISOString(),
        rawText: record.rawText ?? undefined,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listCriteria(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<CriterionFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderCriterionFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderCriterionFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        name: record.name,
        weight: record.weight ?? undefined,
        subCriteria: record.subCriteria ?? undefined,
        scoringMethod: record.scoringMethod ?? undefined,
        priceFormula: record.priceFormula ?? undefined,
        threshold: record.threshold ?? undefined,
        isEliminatory: record.isEliminatory,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listRequirements(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<RequirementFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderRequirementFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderRequirementFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        category: record.category,
        label: record.label,
        expectedFormat: record.expectedFormat ?? undefined,
        isMandatory: record.isMandatory,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listClauses(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<ClauseFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderClauseFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderClauseFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        category: record.category,
        summary: record.summary,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listRisks(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<RiskFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderRiskFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderRiskFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        title: record.title,
        category: record.category,
        severity: record.severity,
        probability: record.probability ?? undefined,
        explanation: record.explanation,
        recommendation: record.recommendation,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listQuestions(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<QuestionFindingRecord>> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const [items, total] = await Promise.all([
      this.prisma.tenderQuestionFinding.findMany({ where, orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset }),
      this.prisma.tenderQuestionFinding.count({ where }),
    ]);
    return {
      items: items.map((record) => ({
        id: record.id,
        question: record.question,
        justification: record.justification,
        priority: record.priority,
        theme: record.theme,
        documentId: record.documentId ?? undefined,
        chunkSequence: record.chunkSequence ?? undefined,
        pageStart: record.pageStart ?? undefined,
        pageEnd: record.pageEnd ?? undefined,
        sheetName: record.sheetName ?? undefined,
        sectionTitle: record.sectionTitle ?? undefined,
        citation: record.citation ?? undefined,
        isInferred: record.isInferred,
        confidence: record.confidence,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
    };
  }

  async getSummary(input: { organizationId: string; tenderId: string; analysisVersion: number }): Promise<TenderAnalysisSummaryRecord | null> {
    const record = await this.prisma.tenderAnalysisSummary.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion },
    });
    return record ? this.toSummaryRecord(record) : null;
  }

  async getLatestSummary(input: { organizationId: string; tenderId: string }): Promise<TenderAnalysisSummaryRecord | null> {
    const record = await this.prisma.tenderAnalysisSummary.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { analysisVersion: "desc" },
    });
    return record ? this.toSummaryRecord(record) : null;
  }

  private toSummaryRecord(record: {
    analysisVersion: number;
    opportunitySummary: string;
    complexityLevel: string;
    mainCriteria: unknown;
    mainRisks: unknown;
    mainObligations: unknown;
    missingElements: unknown;
    pointsToClarify: unknown;
    conflicts: unknown;
    goNoGoRecommendation: string;
    goNoGoRationale: string;
    createdAt: Date;
  }): TenderAnalysisSummaryRecord {
    return {
      analysisVersion: record.analysisVersion,
      opportunitySummary: record.opportunitySummary,
      complexityLevel: record.complexityLevel,
      mainCriteria: record.mainCriteria as string[],
      mainRisks: record.mainRisks as string[],
      mainObligations: record.mainObligations as string[],
      missingElements: record.missingElements as string[],
      pointsToClarify: record.pointsToClarify as string[],
      conflicts: record.conflicts,
      goNoGoRecommendation: record.goNoGoRecommendation,
      goNoGoRationale: record.goNoGoRationale,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
