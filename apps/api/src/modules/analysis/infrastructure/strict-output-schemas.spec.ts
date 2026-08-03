import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DocumentAnalysisOutputSchema } from "../application/schemas/business/document-analysis-output.schema";
import { TenderConsolidationOutputSchema } from "../application/schemas/business/tender-consolidation-output.schema";
import {
  DocumentClauseItemSchema,
  DocumentCriterionItemSchema,
  DocumentDeadlineItemSchema,
  DocumentRequirementItemSchema,
  TenderClauseItemSchema,
  TenderCriterionItemSchema,
  TenderDeadlineItemSchema,
  TenderRequirementItemSchema,
} from "../application/schemas/business/business-analysis-items.schema";
import { TenderAnalysisSummaryOutputSchema, TenderQuestionItemSchema, TenderRiskItemSchema } from "../application/schemas/business/tender-consolidation-output.schema";
import { documentAnalysisJsonSchema, tenderConsolidationJsonSchema } from "./strict-output-schemas";

/**
 * Test de contrat (mission — "documente clairement comment ajouter un futur schéma", "toute dérive
 * doit échouer ce test") — deux garanties distinctes et complémentaires :
 *  1. Chaque schéma JSON écrit à la main respecte STRUCTURELLEMENT le mode strict d'OpenAI (chaque
 *     objet a `additionalProperties: false` et TOUS ses champs dans `required`) — indépendant de Zod.
 *  2. L'ENSEMBLE des noms de champs de chaque schéma JSON correspond exactement à l'ensemble des
 *     noms de champs du schéma Zod réel correspondant — si un futur champ est ajouté/retiré côté
 *     Zod sans mise à jour ici, ce test échoue, jamais une découverte en production.
 */

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodEffects ? unwrap(schema.innerType()) : schema;
}

function zodFieldNames(schema: z.ZodTypeAny): string[] {
  const objectSchema = unwrap(schema) as z.ZodObject<z.ZodRawShape>;
  return Object.keys(objectSchema.shape).sort();
}

function jsonSchemaFieldNames(node: { properties?: Record<string, unknown> }): string[] {
  return Object.keys(node.properties ?? {}).sort();
}

/** Parcourt récursivement un noeud JSON Schema et vérifie le mode strict OpenAI : chaque objet a
 *  `additionalProperties: false` et la totalité de ses propriétés listées dans `required`. */
function assertStrictModeCompliant(node: unknown, path: string): void {
  if (node === null || typeof node !== "object") return;
  const candidate = node as { type?: unknown; properties?: Record<string, unknown>; required?: unknown[]; additionalProperties?: unknown; items?: unknown };

  if (candidate.type === "object" || (candidate.properties && !Array.isArray(candidate.properties))) {
    expect(candidate.additionalProperties, `${path}: additionalProperties must be false`).toBe(false);
    const propertyNames = Object.keys(candidate.properties ?? {});
    expect([...(candidate.required ?? [])].sort(), `${path}: every property must be required in strict mode`).toEqual([...propertyNames].sort());
    for (const [key, value] of Object.entries(candidate.properties ?? {})) {
      assertStrictModeCompliant(value, `${path}.${key}`);
    }
  }
  if (candidate.items) {
    assertStrictModeCompliant(candidate.items, `${path}[]`);
  }
}

describe("strict-output-schemas — conformité mode strict OpenAI", () => {
  it("documentAnalysisJsonSchema: chaque objet imbriqué respecte additionalProperties:false + required exhaustif", () => {
    assertStrictModeCompliant(documentAnalysisJsonSchema, "documentAnalysisJsonSchema");
  });

  it("tenderConsolidationJsonSchema: chaque objet imbriqué respecte additionalProperties:false + required exhaustif", () => {
    assertStrictModeCompliant(tenderConsolidationJsonSchema, "tenderConsolidationJsonSchema");
  });
});

describe("strict-output-schemas — parité des champs avec les schémas Zod réels", () => {
  it("documentAnalysisJsonSchema (niveau racine) a exactement les mêmes champs que DocumentAnalysisOutputSchema", () => {
    expect(jsonSchemaFieldNames(documentAnalysisJsonSchema)).toEqual(zodFieldNames(DocumentAnalysisOutputSchema));
  });

  it("deadlines[] (document) a exactement les mêmes champs que DocumentDeadlineItemSchema", () => {
    expect(jsonSchemaFieldNames(documentAnalysisJsonSchema.properties.deadlines.items)).toEqual(zodFieldNames(DocumentDeadlineItemSchema));
  });

  it("criteria[] (document) a exactement les mêmes champs que DocumentCriterionItemSchema", () => {
    expect(jsonSchemaFieldNames(documentAnalysisJsonSchema.properties.criteria.items)).toEqual(zodFieldNames(DocumentCriterionItemSchema));
  });

  it("requirements[] (document) a exactement les mêmes champs que DocumentRequirementItemSchema", () => {
    expect(jsonSchemaFieldNames(documentAnalysisJsonSchema.properties.requirements.items)).toEqual(zodFieldNames(DocumentRequirementItemSchema));
  });

  it("clauses[] (document) a exactement les mêmes champs que DocumentClauseItemSchema", () => {
    expect(jsonSchemaFieldNames(documentAnalysisJsonSchema.properties.clauses.items)).toEqual(zodFieldNames(DocumentClauseItemSchema));
  });

  it("tenderConsolidationJsonSchema (niveau racine) a exactement les mêmes champs que TenderConsolidationOutputSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema)).toEqual(zodFieldNames(TenderConsolidationOutputSchema));
  });

  it("deadlines[] (tender) a exactement les mêmes champs que TenderDeadlineItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.deadlines.items)).toEqual(zodFieldNames(TenderDeadlineItemSchema));
  });

  it("criteria[] (tender) a exactement les mêmes champs que TenderCriterionItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.criteria.items)).toEqual(zodFieldNames(TenderCriterionItemSchema));
  });

  it("requirements[] (tender) a exactement les mêmes champs que TenderRequirementItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.requirements.items)).toEqual(zodFieldNames(TenderRequirementItemSchema));
  });

  it("clauses[] (tender) a exactement les mêmes champs que TenderClauseItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.clauses.items)).toEqual(zodFieldNames(TenderClauseItemSchema));
  });

  it("risks[] a exactement les mêmes champs que TenderRiskItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.risks.items)).toEqual(zodFieldNames(TenderRiskItemSchema));
  });

  it("questions[] a exactement les mêmes champs que TenderQuestionItemSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.questions.items)).toEqual(zodFieldNames(TenderQuestionItemSchema));
  });

  it("summary a exactement les mêmes champs que TenderAnalysisSummaryOutputSchema", () => {
    expect(jsonSchemaFieldNames(tenderConsolidationJsonSchema.properties.summary)).toEqual(zodFieldNames(TenderAnalysisSummaryOutputSchema));
  });
});
