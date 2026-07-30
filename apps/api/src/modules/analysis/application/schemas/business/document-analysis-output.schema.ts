import { z } from "zod";
import { AiSchemaValidationFailedError } from "../../../domain/errors";
import {
  BusinessMetadataSchema,
  DocumentClauseItemSchema,
  DocumentCriterionItemSchema,
  DocumentDeadlineItemSchema,
  DocumentRequirementItemSchema,
} from "./business-analysis-items.schema";
import { DocumentClassification } from "../../../domain/business/document-classification";

const DOCUMENT_CLASSIFICATIONS = Object.values(DocumentClassification) as [string, ...string[]];

/**
 * Sortie structurée de l'analyse d'UN document (mission Sprint 4.2, étape 1 "Analyse
 * documentaire") — jamais un résumé libre : uniquement les catégories 1 à 5 de la mission
 * (informations générales, dates, critères, exigences, clauses), jamais de risques/questions/
 * synthèse (produits uniquement à l'étape 2, consolidation, à partir de PLUSIEURS documents).
 */
export const DocumentAnalysisOutputSchema = z.object({
  documentType: z.enum(DOCUMENT_CLASSIFICATIONS),
  language: z.string().min(2).max(8),
  metadata: BusinessMetadataSchema,
  deadlines: z.array(DocumentDeadlineItemSchema).max(50),
  criteria: z.array(DocumentCriterionItemSchema).max(50),
  requirements: z.array(DocumentRequirementItemSchema).max(100),
  clauses: z.array(DocumentClauseItemSchema).max(100),
  warnings: z.array(z.string().max(500)).max(50).default([]),
});

export type DocumentAnalysisOutput = z.infer<typeof DocumentAnalysisOutputSchema>;

/**
 * Ne fait jamais confiance au JSON brut du provider (mission §"Sorties structurées") — toute
 * réponse qui ne satisfait pas ce schéma échoue avec `AI_SCHEMA_VALIDATION_FAILED`, jamais
 * silencieusement acceptée ni partiellement persistée.
 */
export function parseDocumentAnalysisOutput(rawContent: string): DocumentAnalysisOutput {
  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch {
    throw new AiSchemaValidationFailedError({ reason: "document analysis response is not valid JSON" });
  }

  const result = DocumentAnalysisOutputSchema.safeParse(json);
  if (!result.success) {
    throw new AiSchemaValidationFailedError({
      reason: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
  }
  return result.data;
}
