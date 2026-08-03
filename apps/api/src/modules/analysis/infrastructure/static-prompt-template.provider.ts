import { Injectable } from "@nestjs/common";
import { ClauseCategory } from "../domain/business/clause-category";
import { DeadlineKind } from "../domain/business/deadline-kind";
import { DocumentClassification } from "../domain/business/document-classification";
import { RequirementCategory } from "../domain/business/requirement-category";
import {
  PROMPT_VERSIONS,
  PromptKey,
  type PromptTemplatePort,
  type PromptVariables,
  type RenderedPrompt,
} from "../application/ports/prompt-template.port";

const COMMON_RULES =
  "Respond ONLY with a single strict JSON object matching the exact shape described. No markdown, no " +
  "commentary, no code fences, no field beyond what is described. Every business fact you report MUST " +
  "carry a 'confidence' number between 0 and 1, and — unless truly tender-wide and un-sourceable — a " +
  "'citation' (short verbatim excerpt, in the source document's original language, never translated) " +
  "and either a 'chunkSequence' (the [n] marker of the chunk you found it in) or leave provenance " +
  "fields out and set 'isInferred' to true if you deduced the fact rather than read it directly. Never " +
  "invent a chunkSequence, page number, or citation that does not really appear in the provided input.";

/**
 * Renfort LOCAL de l'exigence `confidence` (mission — correctif crash prod `AI_SCHEMA_VALIDATION_FAILED`,
 * confidence manquante malgré `COMMON_RULES`) — une seule mention générale en tête de prompt ne
 * suffit pas à obtenir une conformité fiable du modèle sur CHAQUE élément d'un tableau ; cette
 * fonction factorise la phrase de renfort (jamais copiée-collée à la main par tableau) pour que les
 * deux prompts restent alignés sans dupliquer le texte. Générique — aucune mention de fournisseur ni
 * de modèle, reste valable si le provider ou le modèle change.
 */
function requireConfidenceOn(arrayNames: readonly string[]): string {
  const list = arrayNames.map((name) => `'${name}'`).join(", ");
  return (
    `Every single item you add to ${list} MUST carry its own 'confidence' number (0-1) — this is not ` +
    "optional and applies to EVERY item, never just the array as a whole; if you are certain, use a " +
    "high value (e.g. 0.95), never omit the field."
  );
}

/**
 * Prompt technique (Sprint 4.1, inchangé) + les deux prompts métier du Sprint 4.2. Stockage
 * statique/applicatif (mission §"Prompts" — aucun écran d'administration, aucune édition
 * dynamique) : ce fichier est la SEULE source de contenu de prompt, jamais dispersé dans les use
 * cases (mission §"éviter les prompts dispersés dans les use cases").
 */
@Injectable()
export class StaticPromptTemplateProvider implements PromptTemplatePort {
  render(key: PromptKey, variables: PromptVariables): RenderedPrompt {
    switch (key) {
      case PromptKey.TechnicalValidationPlaceholder:
        return {
          version: PROMPT_VERSIONS[key],
          systemPrompt:
            "You are validating the TenderOS AI analysis pipeline foundation. This is a purely technical " +
            "smoke test, not a business document analysis. Respond ONLY with strict JSON matching this " +
            'shape: {"output":{"summary":"<a short technical acknowledgement, at most 200 characters>"}}. ' +
            "Do not include any other field, markdown, or commentary.",
          userPrompt: "Confirm the pipeline is operational by returning the required JSON object.",
        };

      case PromptKey.AnalyzeDocument:
        return this.renderAnalyzeDocument(variables);

      case PromptKey.ConsolidateTenderAnalysis:
        return this.renderConsolidateTenderAnalysis(variables);

      default:
        // Exhaustivité TypeScript : toute nouvelle clé doit être traitée explicitement ci-dessus.
        throw new Error(`No template registered for prompt key "${key satisfies never}".`);
    }
  }

  private renderAnalyzeDocument(variables: PromptVariables): RenderedPrompt {
    return {
      version: PROMPT_VERSIONS[PromptKey.AnalyzeDocument],
      systemPrompt:
        "You are a French public/private procurement (appel d'offres) document analyst working for " +
        "TenderOS. You analyze ONE tender document at a time. You extract reliable, traceable business " +
        "facts — you never invent information, and you never write a free-form summary. " +
        COMMON_RULES +
        " " +
        requireConfidenceOn(["deadlines", "criteria", "requirements", "clauses"]) +
        " Classify 'documentType' as one of: " +
        Object.values(DocumentClassification).join(", ") +
        ". Use 'UNKNOWN' if genuinely unclear. Report 'language' as a 2-letter ISO code (e.g. 'fr', 'en'). " +
        "'deadlines[].kind' must be one of: " +
        Object.values(DeadlineKind).join(", ") +
        ". Every deadline needs a 'label' (short human-readable description, e.g. 'Date limite de remise " +
        "des offres') and a normalized 'date' (full ISO 8601 datetime) OR, if you cannot normalize it " +
        "reliably, a 'rawText' field with the source text instead — never both empty, never a guessed date. " +
        "'requirements[].category' must be one of: " +
        Object.values(RequirementCategory).join(", ") +
        ", and every requirement needs a 'label' (short human-readable description of what is required). " +
        "'clauses[].category' must be one of: " +
        Object.values(ClauseCategory).join(", ") +
        ", and every clause needs a 'summary' (concise plain-language summary of the clause's content, at " +
        "most a few sentences). Every 'criteria[]' entry needs a 'name' (short human-readable label of the " +
        "selection criterion); include 'weight' (0-100) only if explicitly stated, 'isEliminatory' (true " +
        "only for a pass/fail eliminatory criterion, false otherwise), and 'subCriteria'/'scoringMethod'/" +
        "'priceFormula'/'threshold' only when the document actually specifies them. " +
        "The JSON object has exactly these top-level fields: documentType, language, metadata (object), " +
        "deadlines (array), criteria (array), requirements (array), clauses (array), warnings (array of " +
        "short strings describing anything ambiguous, contradictory, or unreadable in this document). Do " +
        "not extract risks or questions here — that only happens at tender-consolidation time.",
      userPrompt:
        "Analyze the following document chunks (each prefixed by its [chunkSequence] marker) and return " +
        "the required JSON object.\n\n" +
        (variables.chunksText ?? ""),
    };
  }

  private renderConsolidateTenderAnalysis(variables: PromptVariables): RenderedPrompt {
    return {
      version: PROMPT_VERSIONS[PromptKey.ConsolidateTenderAnalysis],
      systemPrompt:
        "You are a French public/private procurement (appel d'offres) analyst working for TenderOS. You " +
        "receive the PER-DOCUMENT structured analyses already produced for every document of one tender's " +
        "DCE (dossier de consultation des entreprises). Your job is to consolidate them at the tender " +
        "level: deduplicate repeated facts, resolve or flag contradictions between documents, decide " +
        "priority when documents disagree (RC for procedure/dates/pieces/criteria, CCAP for " +
        "administrative clauses, CCTP for technical requirements, AE for engagement/amounts, BPU/DPGF for " +
        "prices/quantities — but always defer to what the documents actually say over this generic " +
        "rule), detect real business risks, and generate clarification questions for the buyer. " +
        COMMON_RULES +
        " " +
        requireConfidenceOn(["deadlines", "criteria", "requirements", "clauses", "risks", "questions"]) +
        " Every finding must set 'documentId' to the exact id of the source document you used (from the " +
        "input), never a fabricated id. Every risk needs a 'title' (short label), a free-text 'category' " +
        "(e.g. juridique, technique, financier, delai), 'severity' (one of LOW, MEDIUM, HIGH, CRITICAL), " +
        "an 'explanation' (why this is a risk), and a 'recommendation' (what the bidder should do about " +
        "it) — 'probability' (0-1) only if you can reasonably estimate it. Every question needs the " +
        "actual 'question' text to ask the buyer, a 'justification' (why it matters), a 'priority' (one " +
        "of LOW, MEDIUM, HIGH), and a 'theme' (short topic label, e.g. delais, criteres, pieces " +
        "administratives). 'summary' must always include: 'opportunitySummary' (a few sentences), " +
        "'complexityLevel' (one of LOW, MEDIUM, HIGH), 'mainCriteria', 'mainRisks', 'mainObligations', " +
        "'missingElements' and 'pointsToClarify' (each an array of short strings — an empty array if " +
        "genuinely none apply), 'goNoGoRecommendation' (one of GO, GO_WITH_RESERVATIONS, NO_GO, " +
        "INSUFFICIENT_DATA — this is a DECISION-SUPPORT SUGGESTION ONLY, never a final automatic " +
        "decision), and 'goNoGoRationale' (always justify it). The JSON object has exactly these " +
        "top-level fields: metadata, deadlines, criteria, requirements, clauses, risks, questions, summary.",
      userPrompt:
        "Here are the per-document structured analyses for this tender (JSON array, each entry includes " +
        "its documentId):\n\n" +
        (variables.documentAnalysesJson ?? "[]") +
        "\n\nConsolidate them and return the required JSON object.",
    };
  }
}
