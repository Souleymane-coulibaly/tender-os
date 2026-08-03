/**
 * Schémas JSON Schema (format "Structured Outputs" strict d'OpenAI) pour les DEUX seuls contrats
 * de sortie IA réellement structurés de cette tranche — mission "correction du défaut de
 * robustesse des sorties IA structurées" : contrairement au mode `json_object` (texte libre validé
 * après coup seulement), le mode strict garantit CÔTÉ SERVEUR que chaque champ requis (dont
 * `confidence`) est toujours présent, indépendamment du modèle ou de la formulation du prompt.
 *
 * Écrits à la main (jamais dérivés automatiquement de `zod-to-json-schema`, pas une dépendance de
 * ce projet) car le mode strict d'OpenAI impose des contraintes que Zod ne modélise pas
 * nativement :
 *   - TOUS les champs d'un objet doivent figurer dans `required`, y compris ceux "optionnels" —
 *     un champ optionnel devient donc `nullable` (type `[T, "null"]`) plutôt qu'absent.
 *   - `additionalProperties: false` obligatoire sur CHAQUE objet, y compris imbriqué.
 *   - Une règle inter-champs comme ".refine() — date OU rawText" (voir
 *     `business-analysis-items.schema.ts`) n'a pas d'équivalent JSON Schema : les deux champs
 *     deviennent nullable ici, la règle réelle reste vérifiée par la validation Zod APRÈS coup
 *     (`parseDocumentAnalysisOutput`/`parseTenderConsolidationOutput`, inchangés, toujours la
 *     source de vérité finale — le mode strict n'est qu'une garantie supplémentaire en amont,
 *     jamais un remplacement de cette validation).
 *
 * Le test de contrat `strict-output-schemas.spec.ts` vérifie que l'ensemble des champs requis de
 * CHAQUE schéma Zod correspondant apparaît bien ici — toute dérive (nouveau champ requis ajouté au
 * schéma Zod sans mise à jour ici) fait échouer ce test, jamais une découverte en production.
 *
 * Pour ajouter un futur schéma à la liste blanche `STRICT_OUTPUT_SCHEMAS` :
 *   1. Écrire son JSON Schema strict ici (mêmes règles que ci-dessus).
 *   2. L'ajouter à `STRICT_OUTPUT_SCHEMAS` avec la MÊME clé que le `responseSchemaName` déjà
 *      utilisé par le use case appelant (voir `business-analysis-content-resolver.ts`).
 *   3. Ajouter un cas dans `strict-output-schemas.spec.ts` prouvant la parité avec le schéma Zod.
 *   Ne JAMAIS activer le mode strict par défaut pour un nom non explicitement présent ici — voir
 *   `OpenAiProvider.complete()`, qui retombe sur le comportement `json_object` inchangé pour tout
 *   nom absent de cette liste (mission "ne jamais déduire automatiquement qu'un schéma est
 *   compatible uniquement parce que responseSchemaName est renseigné").
 */

const DEADLINE_KINDS = ["PUBLICATION", "SUBMISSION", "QUESTIONS", "ANSWER", "VISIT", "START_ESTIMATED", "VALIDITY_PERIOD", "INTERMEDIATE", "CONTRACTUAL", "OTHER"];
const REQUIREMENT_CATEGORIES = [
  "ADMINISTRATIVE", "TECHNICAL_MEMO", "REFERENCES", "CV", "CERTIFICATION", "INSURANCE", "FINANCIAL_CAPACITY", "TECHNICAL_CAPACITY",
  "HUMAN_RESOURCES", "MATERIAL_RESOURCES", "METHODOLOGY", "PLANNING", "SIGNATURE", "OTHER",
];
const CLAUSE_CATEGORIES = [
  "PENALTY", "WARRANTY", "INSURANCE", "DEADLINE", "CONFIDENTIALITY", "IP", "SECURITY", "CYBERSECURITY", "REVERSIBILITY", "SUBCONTRACTING",
  "CONSORTIUM", "ADVANCE_PAYMENT", "RETENTION_GUARANTEE", "PAYMENT", "INVOICING", "TERMINATION", "RENEWAL", "LIABILITY", "GDPR", "HOSTING",
  "ENVIRONMENTAL_SOCIAL", "OTHER",
];
const DOCUMENT_CLASSIFICATIONS = ["RC", "CCTP", "CCAP", "AE", "BPU", "DPGF", "ANNEX", "UNKNOWN"];
const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const QUESTION_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const COMPLEXITY_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const GO_NO_GO_RECOMMENDATIONS = ["GO", "GO_WITH_RESERVATIONS", "NO_GO", "INSUFFICIENT_DATA"];

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;
const requiredString = { type: "string" } as const;
const requiredNumber = { type: "number" } as const;
const requiredBoolean = { type: "boolean" } as const;

/** `BusinessMetadataSchema` — tous les champs sont `.optional()` côté Zod, donc tous nullable ici. */
const metadataSchema = {
  type: "object",
  properties: {
    title: nullableString,
    reference: nullableString,
    buyer: nullableString,
    contractingAuthority: nullableString,
    purpose: nullableString,
    procedureType: nullableString,
    marketType: nullableString,
    marketForm: nullableString,
    allotment: { type: ["boolean", "null"] },
    lotCount: nullableNumber,
    duration: nullableString,
    renewal: nullableString,
    executionPlace: nullableString,
    cpvCode: nullableString,
    variantsAllowed: { type: ["boolean", "null"] },
    additionalServices: nullableString,
    mandatoryVisit: { type: ["boolean", "null"] },
    negotiationPossible: { type: ["boolean", "null"] },
  },
  required: [
    "title", "reference", "buyer", "contractingAuthority", "purpose", "procedureType", "marketType", "marketForm",
    "allotment", "lotCount", "duration", "renewal", "executionPlace", "cpvCode", "variantsAllowed", "additionalServices", "mandatoryVisit", "negotiationPossible",
  ],
  additionalProperties: false,
} as const;

/** `ProvenanceSchema` (niveau document — pas de `documentId`, déjà connu du contexte). */
const documentProvenanceProperties = {
  chunkSequence: nullableNumber,
  pageStart: nullableNumber,
  pageEnd: nullableNumber,
  sheetName: nullableString,
  sectionTitle: nullableString,
  citation: nullableString,
  isInferred: requiredBoolean,
  confidence: requiredNumber,
};
const documentProvenanceRequired = ["chunkSequence", "pageStart", "pageEnd", "sheetName", "sectionTitle", "citation", "isInferred", "confidence"];

/** `TenderProvenanceSchema` (niveau tender — étend la provenance document avec `documentId`). */
const tenderProvenanceProperties = { ...documentProvenanceProperties, documentId: nullableString };
const tenderProvenanceRequired = [...documentProvenanceRequired, "documentId"];

function deadlineItemSchema(provenanceProperties: object, provenanceRequired: readonly string[]) {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: DEADLINE_KINDS },
      label: requiredString,
      date: nullableString,
      rawText: nullableString,
      ...provenanceProperties,
    },
    required: ["kind", "label", "date", "rawText", ...provenanceRequired],
    additionalProperties: false,
  } as const;
}

function criterionItemSchema(provenanceProperties: object, provenanceRequired: readonly string[]) {
  return {
    type: "object",
    properties: {
      name: requiredString,
      weight: nullableNumber,
      subCriteria: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: { name: requiredString, weight: nullableNumber },
          required: ["name", "weight"],
          additionalProperties: false,
        },
      },
      scoringMethod: nullableString,
      priceFormula: nullableString,
      threshold: nullableString,
      isEliminatory: requiredBoolean,
      ...provenanceProperties,
    },
    required: ["name", "weight", "subCriteria", "scoringMethod", "priceFormula", "threshold", "isEliminatory", ...provenanceRequired],
    additionalProperties: false,
  } as const;
}

function requirementItemSchema(provenanceProperties: object, provenanceRequired: readonly string[]) {
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: REQUIREMENT_CATEGORIES },
      label: requiredString,
      expectedFormat: nullableString,
      isMandatory: requiredBoolean,
      ...provenanceProperties,
    },
    required: ["category", "label", "expectedFormat", "isMandatory", ...provenanceRequired],
    additionalProperties: false,
  } as const;
}

function clauseItemSchema(provenanceProperties: object, provenanceRequired: readonly string[]) {
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: CLAUSE_CATEGORIES },
      summary: requiredString,
      ...provenanceProperties,
    },
    required: ["category", "summary", ...provenanceRequired],
    additionalProperties: false,
  } as const;
}

/** Sortie structurée de l'analyse d'UN document — miroir strict de `DocumentAnalysisOutputSchema`
 *  (`document-analysis-output.schema.ts`). */
export const documentAnalysisJsonSchema = {
  type: "object",
  properties: {
    documentType: { type: "string", enum: DOCUMENT_CLASSIFICATIONS },
    language: requiredString,
    metadata: metadataSchema,
    deadlines: { type: "array", items: deadlineItemSchema(documentProvenanceProperties, documentProvenanceRequired) },
    criteria: { type: "array", items: criterionItemSchema(documentProvenanceProperties, documentProvenanceRequired) },
    requirements: { type: "array", items: requirementItemSchema(documentProvenanceProperties, documentProvenanceRequired) },
    clauses: { type: "array", items: clauseItemSchema(documentProvenanceProperties, documentProvenanceRequired) },
    warnings: { type: "array", items: requiredString },
  },
  required: ["documentType", "language", "metadata", "deadlines", "criteria", "requirements", "clauses", "warnings"],
  additionalProperties: false,
} as const;

/** Sortie structurée de la consolidation Tender — miroir strict de
 *  `TenderConsolidationOutputSchema` (`tender-consolidation-output.schema.ts`). */
export const tenderConsolidationJsonSchema = {
  type: "object",
  properties: {
    metadata: metadataSchema,
    deadlines: { type: "array", items: deadlineItemSchema(tenderProvenanceProperties, tenderProvenanceRequired) },
    criteria: { type: "array", items: criterionItemSchema(tenderProvenanceProperties, tenderProvenanceRequired) },
    requirements: { type: "array", items: requirementItemSchema(tenderProvenanceProperties, tenderProvenanceRequired) },
    clauses: { type: "array", items: clauseItemSchema(tenderProvenanceProperties, tenderProvenanceRequired) },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: requiredString,
          category: requiredString,
          severity: { type: "string", enum: RISK_SEVERITIES },
          probability: nullableNumber,
          explanation: requiredString,
          recommendation: requiredString,
          ...tenderProvenanceProperties,
        },
        required: ["title", "category", "severity", "probability", "explanation", "recommendation", ...tenderProvenanceRequired],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: requiredString,
          justification: requiredString,
          priority: { type: "string", enum: QUESTION_PRIORITIES },
          theme: requiredString,
          ...tenderProvenanceProperties,
        },
        required: ["question", "justification", "priority", "theme", ...tenderProvenanceRequired],
        additionalProperties: false,
      },
    },
    summary: {
      type: "object",
      properties: {
        opportunitySummary: requiredString,
        complexityLevel: { type: "string", enum: COMPLEXITY_LEVELS },
        mainCriteria: { type: "array", items: requiredString },
        mainRisks: { type: "array", items: requiredString },
        mainObligations: { type: "array", items: requiredString },
        missingElements: { type: "array", items: requiredString },
        pointsToClarify: { type: "array", items: requiredString },
        conflicts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: requiredString,
              description: requiredString,
              documentIds: { type: "array", items: requiredString },
            },
            required: ["category", "description", "documentIds"],
            additionalProperties: false,
          },
        },
        goNoGoRecommendation: { type: "string", enum: GO_NO_GO_RECOMMENDATIONS },
        goNoGoRationale: requiredString,
      },
      required: [
        "opportunitySummary", "complexityLevel", "mainCriteria", "mainRisks", "mainObligations",
        "missingElements", "pointsToClarify", "conflicts", "goNoGoRecommendation", "goNoGoRationale",
      ],
      additionalProperties: false,
    },
  },
  required: ["metadata", "deadlines", "criteria", "requirements", "clauses", "risks", "questions", "summary"],
  additionalProperties: false,
} as const;

/**
 * LISTE BLANCHE FERMÉE (mission — "ne jamais activer le mode strict par défaut") — seule source de
 * vérité consultée par `OpenAiProvider.complete()`. Un `responseSchemaName` absent de cette liste
 * (dont `"free_text"`, utilisé par la quasi-totalité des types de génération de contenu, module
 * `generation`) retombe TOUJOURS sur le comportement `json_object` inchangé — jamais un mode strict
 * implicite, jamais une déduction automatique.
 */
export const STRICT_OUTPUT_SCHEMAS: Readonly<Record<string, object>> = {
  DocumentAnalysisOutputSchema: documentAnalysisJsonSchema,
  TenderConsolidationOutputSchema: tenderConsolidationJsonSchema,
};
