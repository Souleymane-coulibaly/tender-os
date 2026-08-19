import { Inject, Injectable } from "@nestjs/common";
import { DCE_REPOSITORY, type DceRepository } from "../../dce";
import { GetDocumentAnalysisInputUseCase, type DocumentAnalysisChunk } from "../../extraction";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import { AnalysisScope } from "../domain/analysis-scope";
import { AnalysisJobMissingTriggeredByRoleError, NoDocumentAnalysesAvailableError } from "../domain/errors";
import type {
  AnalysisContentResolver,
  AnalysisSuccessResult,
  PreparedAnalysisRequest,
} from "../application/ports/analysis-content-resolver";
import {
  BUSINESS_ANALYSIS_REPOSITORY,
  type BusinessAnalysisRepository,
  type DocumentAnalysisRecord,
} from "../application/ports/business-analysis.repository";
import { PROMPT_TEMPLATE, PromptKey, type PromptTemplatePort } from "../application/ports/prompt-template.port";
import { parseDocumentAnalysisOutput } from "../application/schemas/business/document-analysis-output.schema";
import { parseTenderConsolidationOutput } from "../application/schemas/business/tender-consolidation-output.schema";
import {
  validateDocumentAnalysisProvenance,
  validateTenderConsolidationProvenance,
  type ChunksBySequence,
} from "../application/services/finding-provenance-validator";

/** Formate un chunk pour le prompt (mission §"citation"/"chunkSequence") — le marqueur `[n]` est la
 *  SEULE référence que le modèle doit utiliser pour peupler `chunkSequence` ; jamais un numéro de
 *  ligne, jamais un identifiant inventé. */
function formatChunk(chunk: DocumentAnalysisChunk): string {
  const location: string[] = [];
  if (chunk.pageStart !== undefined) {
    location.push(chunk.pageEnd !== undefined && chunk.pageEnd !== chunk.pageStart ? `p.${chunk.pageStart}-${chunk.pageEnd}` : `p.${chunk.pageStart}`);
  }
  if (chunk.sheetName) location.push(`sheet: "${chunk.sheetName}"`);
  if (chunk.sectionTitle) location.push(`section: "${chunk.sectionTitle}"`);
  const locationSuffix = location.length > 0 ? ` (${location.join(", ")})` : "";
  return `[${chunk.sequence}]${locationSuffix}\n${chunk.content}`;
}

function formatChunksForPrompt(chunks: readonly DocumentAnalysisChunk[]): string {
  return chunks.map(formatChunk).join("\n\n---\n\n");
}

/** Index les chunks RÉELS d'un document par `sequence` (mission §"Validation déterministe de
 *  provenance") — jamais reconstruit à partir d'une supposition, toujours du contrat public
 *  Extraction (`GetDocumentAnalysisInputUseCase`). */
function indexChunksBySequence(chunks: readonly DocumentAnalysisChunk[]): ChunksBySequence {
  return new Map(
    chunks.map((chunk) => [
      chunk.sequence,
      { content: chunk.content, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, sheetName: chunk.sheetName, sectionTitle: chunk.sectionTitle },
    ]),
  );
}

/** Sous-ensemble d'un `DocumentAnalysisRecord` réellement utile à la consolidation — jamais le
 *  contenu brut des chunks source (mission §"ne pas recopier inutilement le contenu intégral"). */
function formatDocumentAnalysesForPrompt(analyses: readonly DocumentAnalysisRecord[]): string {
  return JSON.stringify(
    analyses.map((analysis) => ({
      documentId: analysis.documentId,
      documentType: analysis.documentType,
      language: analysis.language,
      metadata: analysis.metadata,
      deadlines: analysis.deadlines,
      criteria: analysis.criteria,
      requirements: analysis.requirements,
      clauses: analysis.clauses,
      warnings: analysis.warnings,
    })),
  );
}

/**
 * Implémentation réelle de `AnalysisContentResolver` (mission Sprint 4.2) — seul point du module
 * Analysis qui consomme à la fois le contrat public Extraction (`GetDocumentAnalysisInputUseCase`,
 * scope DOCUMENT) et les analyses documentaires déjà persistées (`BusinessAnalysisRepository`,
 * scope TENDER). Ne persiste jamais rien elle-même hors de `AnalysisSuccessResult.persist`, qui ne
 * doit être invoquée que comme `onSuccessTx` de `AnalysisJobRepository.finalizeAttempt`.
 */
@Injectable()
export class BusinessAnalysisContentResolver implements AnalysisContentResolver {
  constructor(
    private readonly getDocumentAnalysisInputUseCase: GetDocumentAnalysisInputUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
    @Inject(PROMPT_TEMPLATE) private readonly promptTemplate: PromptTemplatePort,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
  ) {}

  async prepare(job: AnalysisJob): Promise<PreparedAnalysisRequest> {
    if (!job.triggeredByRole) {
      // Jamais un rôle fabriqué pour satisfaire le contrat RBAC-gated d'Extraction (mission
      // §"Phase 2 sans acteur HTTP vivant") — un job créé/retryé après cette mission porte toujours
      // ce champ ; son absence est un bug de données, pas un cas à contourner silencieusement.
      throw new AnalysisJobMissingTriggeredByRoleError();
    }

    if (job.scope === AnalysisScope.Document) {
      const input = await this.getDocumentAnalysisInputUseCase.execute({
        organizationId: job.organizationId,
        tenderId: job.tenderId,
        documentId: job.documentId!,
        actorRole: job.triggeredByRole,
      });

      const rendered = this.promptTemplate.render(PromptKey.AnalyzeDocument, {
        chunksText: formatChunksForPrompt(input.chunks),
      });
      return {
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        responseSchemaName: "DocumentAnalysisOutputSchema",
      };
    }

    const analyses = await this.businessAnalysisRepository.findLatestDocumentAnalyses({
      organizationId: job.organizationId,
      tenderId: job.tenderId,
    });
    if (analyses.length === 0) {
      // Jamais envoyer une consolidation vide au provider (mission §"anti-hallucination") — le job
      // échoue avec un code explicite, récupérable par retry une fois un document analysé.
      throw new NoDocumentAnalysesAvailableError();
    }

    const rendered = this.promptTemplate.render(PromptKey.ConsolidateTenderAnalysis, {
      documentAnalysesJson: formatDocumentAnalysesForPrompt(analyses),
    });
    return {
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      responseSchemaName: "TenderConsolidationOutputSchema",
    };
  }

  async handleSuccess(job: AnalysisJob, rawContent: string): Promise<AnalysisSuccessResult> {
    if (!job.triggeredByRole) {
      // Même garantie qu'en `prepare()` — `handleSuccess` ne réutilise jamais un état mis en cache
      // par `prepare()` (ce resolver est un singleton Nest, potentiellement partagé entre
      // traitements concurrents : aucune donnée de requête n'est jamais conservée sur `this`).
      throw new AnalysisJobMissingTriggeredByRoleError();
    }

    if (job.scope === AnalysisScope.Document) {
      const parsed = parseDocumentAnalysisOutput(rawContent);

      // Validation déterministe de provenance (mission Sprint 4.2, correction) — contre les
      // VRAIS chunks du document, re-résolus ici (jamais réutilisés depuis `prepare()`, voir
      // motif ci-dessus). Lève avant même de construire `persist` : rien n'est jamais persisté
      // pour une provenance fabriquée.
      const input = await this.getDocumentAnalysisInputUseCase.execute({
        organizationId: job.organizationId,
        tenderId: job.tenderId,
        documentId: job.documentId!,
        actorRole: job.triggeredByRole,
      });
      validateDocumentAnalysisProvenance(parsed, indexChunksBySequence(input.chunks));

      const resultSummary =
        `${parsed.documentType}: ${parsed.deadlines.length} échéance(s), ${parsed.criteria.length} critère(s), ` +
        `${parsed.requirements.length} exigence(s), ${parsed.clauses.length} clause(s) détectée(s).`.slice(0, 500);

      return {
        resultSummary,
        persist: async (tx) => {
          await this.businessAnalysisRepository.persistDocumentAnalysis(tx, {
            organizationId: job.organizationId,
            analysisJobId: job.id,
            analysisVersion: job.analysisVersion,
            tenderId: job.tenderId,
            dceId: job.dceId!,
            documentId: job.documentId!,
            extractionVersion: job.extractionVersion!,
            documentVersionId: input.documentVersionId,
            output: parsed,
          });
        },
      };
    }

    const parsed = parseTenderConsolidationOutput(rawContent);

    // Validation déterministe de provenance (mission Sprint 4.2, correction) — `documentId` doit
    // appartenir aux documents réellement consolidés pour CE tender et CETTE organisation ; les
    // chunks réels ne sont résolus (via Extraction) QUE pour les documents effectivement cités,
    // jamais tous les documents du tender par précaution.
    const consolidatedAnalyses = await this.businessAnalysisRepository.findLatestDocumentAnalyses({
      organizationId: job.organizationId,
      tenderId: job.tenderId,
    });
    const consolidatedDocumentIds = new Set(consolidatedAnalyses.map((analysis) => analysis.documentId));
    await validateTenderConsolidationProvenance(parsed, {
      consolidatedDocumentIds,
      resolveChunks: async (documentId) => {
        const input = await this.getDocumentAnalysisInputUseCase.execute({
          organizationId: job.organizationId,
          tenderId: job.tenderId,
          documentId,
          actorRole: job.triggeredByRole!,
        });
        return indexChunksBySequence(input.chunks);
      },
    });

    const resultSummary = `${parsed.summary.goNoGoRecommendation}: ${parsed.summary.opportunitySummary}`.slice(0, 500);

    // Audit Codex P1-004 (round 3) — snapshot documentId -> documentVersionId résolu ICI, une
    // seule fois, à partir de `consolidatedAnalyses` déjà chargé ci-dessus pour la validation de
    // provenance (jamais une seconde résolution plus tard qui pourrait pointer vers une version
    // plus récente du document) : voir PersistTenderConsolidationInput.documentVersionsByDocumentId.
    const documentVersionsByDocumentId: Record<string, string | undefined> = {};
    for (const analysis of consolidatedAnalyses) {
      documentVersionsByDocumentId[analysis.documentId] = analysis.documentVersionId;
    }

    // Checkpoint 2.1-P2.1-FIX-A — `Dce.revision` résolue ICI, la plus tardive possible avant la
    // persistance (même discipline que `documentVersionId` re-résolu en `handleSuccess`, jamais
    // réutilisé depuis `prepare()`, pour minimiser la fenêtre entre "contenu réellement lu par le
    // provider" et "revision figée") — jamais réinterrogée plus tard. Absence de Dce pour ce Tender
    // (legacy ou race bénigne) → `undefined`, jamais un blocage de la consolidation par ailleurs
    // valide.
    const dce = await this.dceRepository.findByTenderId({ organizationId: job.organizationId, tenderId: job.tenderId });

    return {
      resultSummary,
      persist: async (tx) => {
        await this.businessAnalysisRepository.persistTenderConsolidation(tx, {
          organizationId: job.organizationId,
          analysisJobId: job.id,
          analysisVersion: job.analysisVersion,
          tenderId: job.tenderId,
          output: parsed,
          documentVersionsByDocumentId,
          dceRevision: dce?.revision,
        });
      },
    };
  }
}
