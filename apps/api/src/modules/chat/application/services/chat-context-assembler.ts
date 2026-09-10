import { Inject, Injectable } from "@nestjs/common";
import {
  GetEffectiveTenderAnalysisSummaryUseCase,
  ListTenderClausesUseCase,
  ListTenderCriteriaUseCase,
  ListTenderDeadlinesUseCase,
  ListTenderQuestionsUseCase,
  ListTenderRequirementsUseCase,
  ListTenderRisksUseCase,
  TenderBusinessAnalysisNotFoundError,
} from "../../../analysis";
import { GetKnowledgeVersionUseCase, KnowledgeEntryNotFoundError, KnowledgeEntryVersionNotFoundError, SearchKnowledgeBaseUseCase } from "../../../knowledge-base";
import { GetGoNoGoReportUseCase, GoNoGoReportNotFoundError } from "../../../opportunity";
import {
  AWARD_CRITERION_REPOSITORY,
  CHECKLIST_ITEM_REPOSITORY,
  MILESTONE_REPOSITORY,
  RISK_REPOSITORY,
  TENDER_LOT_REPOSITORY,
  type AwardCriterionRepository,
  type ChecklistItemRepository,
  type MilestoneRepository,
  type RiskRepository,
  type TenderLotRepository,
  type TenderSummary,
} from "../../../tenders";
import { CitationFindingType, CitationSourceType } from "../../domain/message-citation.entity";
import type { KnownChatReference, KnownChatReferences } from "../../domain/chat-citation-validator";
import { DCE_CHUNK_SEARCH_PROVIDER, type DceChunkSearchProvider } from "../ports/dce-chunk-search-provider";

const FINDINGS_PAGE_SIZE = 50;
const DCE_CHUNK_LIMIT = 10;
const KNOWLEDGE_RESULT_LIMIT = 10;

export type ChatContext = Readonly<{
  /** Bloc texte prêt à être injecté dans le prompt utilisateur, hiérarchie des sources dans l'ordre
   *  du mission §18 : donnée structurée Tender > GO/NO-GO > Findings validés > Checklist > extraits
   *  DCE > Knowledge Base validée. */
  contextBlock: string;
  /** Sources RÉELLEMENT injectées ci-dessus — seul référentiel autorisé pour
   *  `chat-citation-validator.ts`. */
  knownReferences: KnownChatReferences;
}>;

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "(non renseignée)";
}

/**
 * Assembleur de contexte UNIQUE du Chat (mission §18) — toutes les données proviennent de use
 * cases/repositories qui s'auto-protègent déjà au niveau organisation/tender (jamais un accès
 * direct à Prisma pour des données métier existantes ; seule exception assumée :
 * `DceChunkSearchProvider`, qui n'a pas d'équivalent use case, voir sa propre justification). Le
 * scope Candidat/Knowledge est résolu ICI, jamais laissé au LLM (mission §49/§50 "le filtrage a
 * lieu avant toute requête de retrieval, jamais après").
 */
@Injectable()
export class ChatContextAssembler {
  constructor(
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly awardCriterionRepository: AwardCriterionRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly listTenderDeadlinesUseCase: ListTenderDeadlinesUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly listTenderRisksUseCase: ListTenderRisksUseCase,
    private readonly listTenderQuestionsUseCase: ListTenderQuestionsUseCase,
    private readonly getGoNoGoReportUseCase: GetGoNoGoReportUseCase,
    @Inject(DCE_CHUNK_SEARCH_PROVIDER) private readonly dceChunkSearchProvider: DceChunkSearchProvider,
    private readonly searchKnowledgeBaseUseCase: SearchKnowledgeBaseUseCase,
    private readonly getKnowledgeVersionUseCase: GetKnowledgeVersionUseCase,
  ) {}

  async assemble(input: {
    organizationId: string;
    tenderId: string;
    actorId: string;
    actorRole: string;
    tender: TenderSummary;
    question: string;
  }): Promise<ChatContext> {
    const known = new Map<string, KnownChatReference>();
    const sections: string[] = [];
    const register = (sourceRef: string, reference: KnownChatReference): string => {
      known.set(sourceRef, reference);
      return sourceRef;
    };

    sections.push(this.buildTenderFieldsSection(input.tender, register));

    const findingsQuery = { organizationId: input.organizationId, tenderId: input.tenderId, actorRole: input.actorRole, actorId: input.actorId, limit: FINDINGS_PAGE_SIZE, offset: 0 };
    const [lots, criteria, milestones, risks, checklistItems] = await Promise.all([
      this.tenderLotRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId }),
      this.awardCriterionRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId }),
      this.milestoneRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId }),
      this.riskRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId }),
      this.checklistItemRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId }),
    ]);

    sections.push(
      bulletListSection(
        "LOTS",
        lots.map((lot) => register(`TENDER:lot:${lot.id}`, { sourceType: CitationSourceType.TenderField, label: `Lot ${lot.lotNumber} — ${lot.title}`, content: `Lot ${lot.lotNumber} — ${lot.title}${lot.description ? ` : ${lot.description}` : ""}${lot.estimatedAmount ? ` (montant estimé ${lot.estimatedAmount} ${lot.currency ?? ""})` : ""}` })),
        (ref) => known.get(ref)!.content,
      ),
    );

    sections.push(
      bulletListSection(
        "CRITÈRES D'ATTRIBUTION",
        criteria.map((criterion) => register(`TENDER:criterion:${criterion.id}`, { sourceType: CitationSourceType.TenderField, label: `Critère : ${criterion.name}`, content: `${criterion.name} (pondération ${criterion.weight})${criterion.description ? ` : ${criterion.description}` : ""}` })),
        (ref) => known.get(ref)!.content,
      ),
    );

    sections.push(
      bulletListSection(
        "JALONS",
        milestones.map((milestone) => register(`TENDER:milestone:${milestone.id}`, { sourceType: CitationSourceType.TenderField, label: `Jalon : ${milestone.title}`, content: `${milestone.title} — ${formatDate(milestone.date.toISOString())} (${milestone.status})` })),
        (ref) => known.get(ref)!.content,
      ),
    );

    sections.push(
      bulletListSection(
        "RISQUES SUIVIS",
        risks.map((risk) => register(`TENDER:risk:${risk.id}`, { sourceType: CitationSourceType.TenderField, label: `Risque suivi : ${risk.title}`, content: `${risk.title} (sévérité ${risk.severity}, statut ${risk.status})${risk.mitigation ? ` — mitigation : ${risk.mitigation}` : ""}` })),
        (ref) => known.get(ref)!.content,
      ),
    );

    sections.push(
      bulletListSection(
        "CHECKLIST DE CONFORMITÉ",
        checklistItems.map((item) => register(`CHK:${item.id}`, { sourceType: CitationSourceType.ChecklistItem, checklistItemId: item.id, label: `Checklist : ${item.title}`, content: `${item.title} — conformité : ${item.complianceStatus}, document : ${item.documentStatus}${item.criticality ? `, criticité ${item.criticality}` : ""}` })),
        (ref) => known.get(ref)!.content,
      ),
    );

    const goNoGo = await this.getGoNoGoReportUseCase
      .execute({ organizationId: input.organizationId, tenderId: input.tenderId, actorId: input.actorId, actorRole: input.actorRole })
      .catch((error) => {
        if (error instanceof GoNoGoReportNotFoundError) return null;
        throw error;
      });
    if (goNoGo) {
      const ref = register(`TENDER:goNoGo`, {
        sourceType: CitationSourceType.TenderField,
        label: "Dernière recommandation GO/NO-GO",
        content: `Score global ${goNoGo.globalScore}/100, recommandation ${goNoGo.recommendation} — ${goNoGo.recommendationRationale}`,
      });
      sections.push(`## GO/NO-GO\n- [${ref}] ${known.get(ref)!.content}`);
    } else {
      sections.push("## GO/NO-GO\n(aucun rapport généré pour ce tender)");
    }

    const analysisSummary = await this.getEffectiveTenderAnalysisSummaryUseCase
      .execute({ organizationId: input.organizationId, tenderId: input.tenderId, actorRole: input.actorRole, actorId: input.actorId })
      .catch((error) => {
        if (error instanceof TenderBusinessAnalysisNotFoundError) return null;
        throw error;
      });
    if (analysisSummary) {
      const ref = register(`TENDER:analysisSummary`, {
        sourceType: CitationSourceType.TenderField,
        label: "Synthèse d'analyse IA",
        content: `${analysisSummary.opportunitySummary} (complexité : ${analysisSummary.complexityLevel})`,
      });
      sections.push(`## SYNTHÈSE D'ANALYSE\n- [${ref}] ${known.get(ref)!.content}`);
    }

    const [deadlines, deadlineCriteria, requirements, clauses, riskFindings, questions] = await Promise.all([
      this.listTenderDeadlinesUseCase.execute(findingsQuery),
      this.listTenderCriteriaUseCase.execute(findingsQuery),
      this.listTenderRequirementsUseCase.execute(findingsQuery),
      this.listTenderClausesUseCase.execute(findingsQuery),
      this.listTenderRisksUseCase.execute(findingsQuery),
      this.listTenderQuestionsUseCase.execute(findingsQuery),
    ]);

    sections.push(
      this.buildFindingsSection("ÉCHÉANCES DÉTECTÉES DANS LE DCE", CitationFindingType.Deadline, deadlines.items, register, (item) => `${item.label}${item.date ? ` — ${formatDate(item.date)}` : ""}`),
    );
    sections.push(
      this.buildFindingsSection("CRITÈRES DÉTECTÉS DANS LE DCE", CitationFindingType.Criterion, deadlineCriteria.items, register, (item) => `${item.name}${item.weight ? ` (poids ${item.weight})` : ""}`),
    );
    sections.push(
      this.buildFindingsSection("EXIGENCES DÉTECTÉES DANS LE DCE", CitationFindingType.Requirement, requirements.items, register, (item) => `[${item.category}] ${item.label}`),
    );
    sections.push(this.buildFindingsSection("CLAUSES DÉTECTÉES DANS LE DCE", CitationFindingType.Clause, clauses.items, register, (item) => `[${item.category}] ${item.summary}`));
    sections.push(
      this.buildFindingsSection("RISQUES DÉTECTÉS DANS LE DCE", CitationFindingType.Risk, riskFindings.items, register, (item) => `[${item.severity}] ${item.title} — ${item.explanation}`),
    );
    sections.push(this.buildFindingsSection("QUESTIONS À POSER À L'ACHETEUR", CitationFindingType.Question, questions.items, register, (item) => `[${item.theme}] ${item.question}`));

    const dceChunks = await this.dceChunkSearchProvider.search({ organizationId: input.organizationId, tenderId: input.tenderId, query: input.question, limit: DCE_CHUNK_LIMIT });
    sections.push(
      bulletListSection(
        "EXTRAITS DU DCE (recherche sur la question posée)",
        dceChunks.map((chunk) =>
          register(`DOC:${chunk.documentId}:${chunk.chunkSequence}`, {
            sourceType: CitationSourceType.Document,
            documentId: chunk.documentId,
            documentVersionId: chunk.documentVersionId,
            chunkSequence: chunk.chunkSequence,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            sheetName: chunk.sheetName,
            sectionTitle: chunk.sectionTitle,
            label: `${chunk.documentTitle}${chunk.pageStart ? ` (p. ${chunk.pageStart}${chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ""})` : ""}`,
            content: chunk.content,
          }),
        ),
        (ref) => known.get(ref)!.content,
      ),
    );

    const rawKnowledgeItems = await this.searchValidatedKnowledge(input);
    const resolvedKnowledgeVersionIds = await Promise.all(
      rawKnowledgeItems.map((item) => this.resolveKnowledgeEntryVersionId({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, knowledgeEntryId: item.knowledgeEntryId, versionNumber: item.activeVersionNumber })),
    );
    // Correctif audit Codex round 2 P1 — une citation KNOWLEDGE_ENTRY DOIT toujours désigner une
    // version réelle et vérifiée : jamais enregistrée avec `knowledgeEntryVersionId: undefined`.
    // Si la résolution échoue (fenêtre de course bénigne, voir `resolveKnowledgeEntryVersionId`),
    // l'entrée est EXCLUE du contexte plutôt que citée sans provenance exacte — jamais un compromis
    // silencieux sur la précision de la citation.
    const knowledgeItems = rawKnowledgeItems
      .map((item, index) => ({ item, versionId: resolvedKnowledgeVersionIds[index] }))
      .filter((entry): entry is { item: (typeof rawKnowledgeItems)[number]; versionId: string } => entry.versionId !== undefined);
    sections.push(
      bulletListSection(
        "CONNAISSANCES VALIDÉES DE L'ENTREPRISE",
        knowledgeItems.map(({ item, versionId }) =>
          register(`KB:${item.knowledgeEntryId}`, {
            sourceType: CitationSourceType.KnowledgeEntry,
            knowledgeEntryId: item.knowledgeEntryId,
            knowledgeEntryVersionId: versionId,
            label: item.title,
            content: item.snippet,
          }),
        ),
        (ref) => known.get(ref)!.content,
      ),
    );

    return { contextBlock: sections.join("\n\n"), knownReferences: known };
  }

  private buildTenderFieldsSection(tender: TenderSummary, register: (sourceRef: string, reference: KnownChatReference) => string): string {
    const fields: Array<[string, string, string]> = [
      ["title", "Titre", tender.title],
      ["reference", "Référence", tender.reference ?? "(non renseignée)"],
      ["buyerName", "Acheteur", tender.buyerName ?? "(non renseigné)"],
      ["submissionDeadline", "Date limite de remise des plis", formatDate(tender.submissionDeadline)],
      ["questionsDeadline", "Date limite pour poser des questions", formatDate(tender.questionsDeadline)],
      ["visitDate", "Date de visite", formatDate(tender.visitDate)],
      ["estimatedAmount", "Montant estimé", tender.estimatedAmount ? `${tender.estimatedAmount} ${tender.currency ?? ""}` : "(non renseigné)"],
      ["executionLocation", "Lieu d'exécution", tender.executionLocation ?? "(non renseigné)"],
      ["contractDurationMonths", "Durée du marché", tender.contractDurationMonths ? `${tender.contractDurationMonths} mois` : "(non renseignée)"],
      ["procedureType", "Type de procédure", tender.procedureType ?? "(non renseigné)"],
      ["status", "Statut du Tender", tender.status],
    ];
    const lines = fields.map(([key, label, value]) => {
      const ref = register(`TENDER:${key}`, { sourceType: CitationSourceType.TenderField, label, content: `${label} : ${value}` });
      return `- [${ref}] ${label} : ${value}`;
    });
    return `## DONNÉES STRUCTURÉES DU TENDER\n${lines.join("\n")}`;
  }

  private buildFindingsSection<T extends { id: string }>(
    title: string,
    findingType: CitationFindingType,
    items: readonly T[],
    register: (sourceRef: string, reference: KnownChatReference) => string,
    format: (item: T) => string,
  ): string {
    if (items.length === 0) return `## ${title}\n(aucun)`;
    const lines = items.map((item) => {
      const content = format(item);
      const ref = register(`FIND:${findingType}:${item.id}`, { sourceType: CitationSourceType.Finding, findingType, findingId: item.id, label: content, content });
      return `- [${ref}] ${content}`;
    });
    return `## ${title}\n${lines.join("\n")}`;
  }

  /** Mission §"jamais une connaissance non validée ou d'une autre entreprise candidate" — DEUX
   *  requêtes séparées et JAMAIS une résolution non filtrée : les connaissances propres au client de
   *  CE Tender (jamais un autre client, même accessible par l'acteur) et les connaissances globales
   *  (réutilisables par tout client). `validatedOnly: true` est TOUJOURS forcé, jamais piloté par le
   *  client HTTP. */
  private async searchValidatedKnowledge(input: { organizationId: string; actorId: string; actorRole: string; tender: TenderSummary; question: string }) {
    const baseQuery = { organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, query: input.question, validatedOnly: true, limit: KNOWLEDGE_RESULT_LIMIT, offset: 0 };
    const [clientScoped, global] = await Promise.all([
      this.searchKnowledgeBaseUseCase.execute({ ...baseQuery, clientAccountId: input.tender.clientAccountId }),
      this.searchKnowledgeBaseUseCase.execute({ ...baseQuery, clientAccountId: "GLOBAL" }),
    ]);
    const byEntryId = new Map([...clientScoped.items, ...global.items].map((item) => [item.knowledgeEntryId, item]));
    return [...byEntryId.values()];
  }

  /** Correctif audit Codex P1 (round 2) — une citation KNOWLEDGE_ENTRY doit désigner la version
   *  EXACTE (validée) réellement utilisée, jamais seulement l'entrée : `SearchKnowledgeBaseUseCase`
   *  n'expose que `activeVersionNumber` (un numéro), résolu ici en identifiant réel de
   *  `KnowledgeEntryVersion`. `undefined` UNIQUEMENT dans la fenêtre de course bénigne où l'entrée/
   *  la version aurait disparu entre la recherche et cette résolution (jamais une erreur bloquante
   *  pour tout le tour de Chat) — l'appelant (`assemble`) EXCLUT alors entièrement cette entrée du
   *  contexte plutôt que de citer une source sans provenance exacte (jamais un `undefined` toléré
   *  sur une citation réellement enregistrée). */
  private async resolveKnowledgeEntryVersionId(input: { organizationId: string; actorId: string; actorRole: string; knowledgeEntryId: string; versionNumber: number }): Promise<string | undefined> {
    try {
      const version = await this.getKnowledgeVersionUseCase.execute({
        organizationId: input.organizationId,
        knowledgeEntryId: input.knowledgeEntryId,
        versionNumber: input.versionNumber,
        actorId: input.actorId,
        actorRole: input.actorRole,
      });
      return version.id;
    } catch (error) {
      if (error instanceof KnowledgeEntryVersionNotFoundError || error instanceof KnowledgeEntryNotFoundError) return undefined;
      throw error;
    }
  }
}

function bulletListSection(title: string, sourceRefs: readonly string[], contentOf: (sourceRef: string) => string): string {
  if (sourceRefs.length === 0) return `## ${title}\n(aucun)`;
  return `## ${title}\n${sourceRefs.map((ref) => `- [${ref}] ${contentOf(ref)}`).join("\n")}`;
}
