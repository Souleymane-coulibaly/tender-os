import { Injectable } from "@nestjs/common";
import {
  GetTenderBusinessAnalysisUseCase,
  ListTenderClausesUseCase,
  ListTenderCriteriaUseCase,
  ListTenderDeadlinesUseCase,
  ListTenderQuestionsUseCase,
  ListTenderRequirementsUseCase,
  ListTenderRisksUseCase,
  TenderBusinessAnalysisNotFoundError,
} from "../../../analysis";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { SearchKnowledgeBaseUseCase } from "../../../knowledge-base";
import { GetTenderUseCase } from "../../../tenders";
import type { KnownKnowledgeReferences } from "../../domain/generation-citation-validator";
import { GenerationTaskType, type GenerationTaskType as GenerationTaskTypeT } from "../../domain/generation-task-type";

const FINDINGS_PAGE_SIZE = 200;

export type BuildGenerationContextInput = Readonly<{
  organizationId: string;
  tenderId: string;
  taskType: GenerationTaskTypeT;
  /** Ex. l'id d'un TenderAwardCriterion pour CRITERION_RESPONSE — filtre le contexte à cette
   *  cible précise plutôt que d'injecter tous les critères du tender. */
  targetRef?: string | undefined;
  actorId: string;
  actorRole: string;
}>;

export type GenerationContext = Readonly<{
  clientAccountId: string;
  /** Variables `{{...}}` prêtes pour le PromptRenderer — jamais une variable arbitraire venant du
   *  frontend, uniquement des données réellement chargées et autorisées ici. */
  variables: Readonly<Record<string, string>>;
  /** Sources Knowledge Base RÉELLEMENT injectées dans le prompt — utilisé par
   *  `generation-citation-validator.ts` pour rejeter toute citation hors de cet ensemble. */
  knownKnowledgeReferences: KnownKnowledgeReferences;
}>;

function bulletList(lines: readonly string[]): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : "(aucun)";
}

/**
 * Assembleur de contexte UNIQUE et GÉNÉRIQUE (mission Sprint 6 §"Ne code pas en dur toute la
 * logique dans un seul service") — même signature quel que soit `taskType` ; tout ce qui est
 * spécifique à un type de tâche vit dans le contenu du `PromptVersion` (donnée), jamais dans une
 * branche if/else ici. Toutes les données proviennent de use cases qui s'auto-protègent déjà
 * (organisation/client/rôle) — jamais un accès direct à Prisma, jamais une donnée d'un autre client
 * injectée (mission §"Aucune donnée d'un autre client ne doit être injectée dans un prompt").
 */
@Injectable()
export class GenerationContextBuilder {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly getTenderBusinessAnalysisUseCase: GetTenderBusinessAnalysisUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderRisksUseCase: ListTenderRisksUseCase,
    private readonly listTenderDeadlinesUseCase: ListTenderDeadlinesUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly listTenderQuestionsUseCase: ListTenderQuestionsUseCase,
    private readonly searchKnowledgeBaseUseCase: SearchKnowledgeBaseUseCase,
  ) {}

  async build(input: BuildGenerationContextInput): Promise<GenerationContext> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorRole: input.actorRole,
      actorId: input.actorId,
    });

    const client = await this.getClientAccountUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    const pageQuery = {
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorRole: input.actorRole,
      actorId: input.actorId,
      limit: FINDINGS_PAGE_SIZE,
      offset: 0,
    };

    const [businessAnalysis, criteria, requirements, risks, deadlines, clauses, questions] = await Promise.all([
      this.getTenderBusinessAnalysisUseCase
        .execute({
          organizationId: input.organizationId,
          tenderId: input.tenderId,
          actorRole: input.actorRole,
          actorId: input.actorId,
        })
        .catch((error) => {
          // Aucune analyse consolidée n'a encore réussi pour ce tender — un contexte de génération
          // partiel reste utile (findings bruts déjà disponibles), jamais une erreur bloquante.
          if (error instanceof TenderBusinessAnalysisNotFoundError) return null;
          throw error;
        }),
      this.listTenderCriteriaUseCase.execute(pageQuery),
      this.listTenderRequirementsUseCase.execute(pageQuery),
      this.listTenderRisksUseCase.execute(pageQuery),
      this.listTenderDeadlinesUseCase.execute(pageQuery),
      this.listTenderClausesUseCase.execute(pageQuery),
      this.listTenderQuestionsUseCase.execute(pageQuery),
    ]);

    const variables: Record<string, string> = {
      "tender.title": tender.title,
      "tender.reference": tender.reference ?? "",
      "tender.buyerName": tender.buyerName ?? "",
      "tender.description": tender.description ?? "",
      "tender.estimatedAmount": tender.estimatedAmount ?? "",
      "tender.submissionDeadline": tender.submissionDeadline ?? "",
      "client.name": client.name,
      "client.sector": client.sector ?? "",
      "analysis.opportunitySummary": businessAnalysis?.opportunitySummary ?? "",
      "analysis.goNoGoRecommendation": businessAnalysis?.goNoGoRecommendation ?? "",
      "analysis.scoringCriteria": bulletList(
        criteria.items.map((c) => `${c.name}${c.weight !== undefined ? ` (poids ${c.weight})` : ""}`),
      ),
      "analysis.requirements": bulletList(requirements.items.map((r) => `[${r.category}] ${r.label}`)),
      "analysis.risks": bulletList(risks.items.map((r) => `[${r.severity}] ${r.title}: ${r.explanation}`)),
      "analysis.deadlines": bulletList(deadlines.items.map((d) => `${d.label}${d.date ? ` (${d.date})` : ""}`)),
      "analysis.clauses": bulletList(clauses.items.map((c) => `[${c.category}] ${c.summary}`)),
      "analysis.questions": bulletList(questions.items.map((q) => `[${q.theme}] ${q.question}`)),
    };

    let knownKnowledgeReferences: KnownKnowledgeReferences = new Map();

    if (input.taskType === GenerationTaskType.CriterionResponse) {
      const targetCriterion = input.targetRef ? criteria.items.find((c) => c.id === input.targetRef) : undefined;
      const searchTerms = targetCriterion?.name ?? tender.title;

      const knowledgeResults = await this.searchKnowledgeBaseUseCase.execute({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        query: searchTerms,
        clientAccountId: tender.clientAccountId,
        limit: 10,
        offset: 0,
      });

      const referencesMap = new Map(
        knowledgeResults.items.map((item) => [item.knowledgeEntryId, { knowledgeEntryId: item.knowledgeEntryId, excerpt: item.snippet }]),
      );
      knownKnowledgeReferences = referencesMap;

      variables["generation.targetCriterion"] = targetCriterion?.name ?? "";
      variables["knowledge.references"] = bulletList(
        knowledgeResults.items.map((item) => `[${item.knowledgeEntryId}] ${item.title}: ${item.snippet}`),
      );
      variables["knowledge.methodology"] = bulletList(
        knowledgeResults.items.filter((item) => item.category === "METHODOLOGY").map((item) => item.snippet),
      );
    }

    return { clientAccountId: tender.clientAccountId, variables, knownKnowledgeReferences };
  }
}
