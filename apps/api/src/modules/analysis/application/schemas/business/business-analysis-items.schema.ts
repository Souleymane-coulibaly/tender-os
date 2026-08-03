import { z } from "zod";
import { ClauseCategory } from "../../../domain/business/clause-category";
import { DeadlineKind } from "../../../domain/business/deadline-kind";
import { RequirementCategory } from "../../../domain/business/requirement-category";
import { ProvenanceSchema, TenderProvenanceSchema } from "./provenance.schema";

/**
 * Formes communes aux sorties LLM document-level et tender-level (mission Sprint 4.2 §1-5) — un
 * seul fichier, jamais deux définitions divergentes du même concept entre l'étape 1 (analyse
 * documentaire) et l'étape 2 (consolidation Tender). Le niveau tender étend simplement la
 * provenance (`TenderProvenanceSchema`, désigne le document source parmi plusieurs).
 */

// Mission §1 "Informations générales" — objet volontairement plat, tous champs optionnels : un
// DCE ne contient pas toujours l'information, jamais une raison de faire échouer l'analyse.
export const BusinessMetadataSchema = z.object({
  title: z.string().max(500).optional().nullable(),
  reference: z.string().max(255).optional().nullable(),
  buyer: z.string().max(300).optional().nullable(),
  contractingAuthority: z.string().max(300).optional().nullable(),
  purpose: z.string().max(2000).optional().nullable(),
  procedureType: z.string().max(200).optional().nullable(),
  marketType: z.string().max(100).optional().nullable(),
  marketForm: z.string().max(100).optional().nullable(),
  allotment: z.boolean().optional().nullable(),
  lotCount: z.number().int().min(0).optional().nullable(),
  duration: z.string().max(200).optional().nullable(),
  renewal: z.string().max(200).optional().nullable(),
  executionPlace: z.string().max(300).optional().nullable(),
  cpvCode: z.string().max(50).optional().nullable(),
  variantsAllowed: z.boolean().optional().nullable(),
  additionalServices: z.string().max(1000).optional().nullable(),
  mandatoryVisit: z.boolean().optional().nullable(),
  negotiationPossible: z.boolean().optional().nullable(),
});
export type BusinessMetadataOutput = z.infer<typeof BusinessMetadataSchema>;

const DEADLINE_KINDS = Object.values(DeadlineKind) as [string, ...string[]];
const REQUIREMENT_CATEGORIES = Object.values(RequirementCategory) as [string, ...string[]];
const CLAUSE_CATEGORIES = Object.values(ClauseCategory) as [string, ...string[]];

function makeDeadlineSchema<P extends z.AnyZodObject>(provenance: P) {
  return z
    .object({
      kind: z.enum(DEADLINE_KINDS),
      label: z.string().min(1).max(300),
      // Mission §"Chaque date doit être normalisée dans un format stable" — ISO 8601 complet.
      date: z.string().datetime().optional().nullable(),
      rawText: z.string().max(300).optional().nullable(),
    })
    .merge(provenance)
    // `!= null` (comparaison lâche) couvre `undefined` ET `null` en une seule fois — le mode
    // Structured Outputs strict d'OpenAI envoie `null`, jamais une clé absente (voir
    // `strict-output-schemas.ts`) ; une comparaison stricte `!== undefined` laisserait passer à
    // tort un objet où date/rawText valent `null` tous les deux.
    .refine((value) => value.date != null || value.rawText != null, {
      message: "a deadline must carry either a normalized date or the source raw text",
    });
}
export const DocumentDeadlineItemSchema = makeDeadlineSchema(ProvenanceSchema);
export const TenderDeadlineItemSchema = makeDeadlineSchema(TenderProvenanceSchema);
export type TenderDeadlineItemOutput = z.infer<typeof TenderDeadlineItemSchema>;

function makeCriterionSchema<P extends z.AnyZodObject>(provenance: P) {
  return z
    .object({
      name: z.string().min(1).max(300),
      weight: z.number().min(0).max(100).optional().nullable(),
      subCriteria: z
        .array(z.object({ name: z.string().min(1).max(300), weight: z.number().min(0).max(100).optional().nullable() }))
        .optional()
        .nullable(),
      scoringMethod: z.string().max(500).optional().nullable(),
      priceFormula: z.string().max(500).optional().nullable(),
      threshold: z.string().max(300).optional().nullable(),
      isEliminatory: z.boolean().default(false),
    })
    .merge(provenance);
}
export const DocumentCriterionItemSchema = makeCriterionSchema(ProvenanceSchema);
export const TenderCriterionItemSchema = makeCriterionSchema(TenderProvenanceSchema);
export type TenderCriterionItemOutput = z.infer<typeof TenderCriterionItemSchema>;

function makeRequirementSchema<P extends z.AnyZodObject>(provenance: P) {
  return z
    .object({
      category: z.enum(REQUIREMENT_CATEGORIES),
      label: z.string().min(1).max(300),
      expectedFormat: z.string().max(300).optional().nullable(),
      isMandatory: z.boolean().default(true),
    })
    .merge(provenance);
}
export const DocumentRequirementItemSchema = makeRequirementSchema(ProvenanceSchema);
export const TenderRequirementItemSchema = makeRequirementSchema(TenderProvenanceSchema);
export type TenderRequirementItemOutput = z.infer<typeof TenderRequirementItemSchema>;

function makeClauseSchema<P extends z.AnyZodObject>(provenance: P) {
  return z
    .object({
      category: z.enum(CLAUSE_CATEGORIES),
      summary: z.string().min(1).max(2000),
    })
    .merge(provenance);
}
export const DocumentClauseItemSchema = makeClauseSchema(ProvenanceSchema);
export const TenderClauseItemSchema = makeClauseSchema(TenderProvenanceSchema);
export type TenderClauseItemOutput = z.infer<typeof TenderClauseItemSchema>;
