export const GENERATION_TASK_TYPE_LABELS: Record<string, string> = {
  EXECUTIVE_SUMMARY: "Synthèse exécutive",
  NEED_UNDERSTANDING: "Compréhension du besoin",
  CRITERION_RESPONSE: "Réponse à un critère",
  METHODOLOGY: "Méthodologie",
  ORGANIZATION: "Organisation",
  GOVERNANCE: "Gouvernance",
  HUMAN_RESOURCES: "Moyens humains",
  TECHNICAL_RESOURCES: "Moyens techniques",
  PLANNING: "Planning",
  RISK_MANAGEMENT: "Gestion des risques",
  QUALITY: "Qualité",
  SECURITY: "Sécurité",
  CSR: "RSE",
  REFERENCES: "Références",
  SECTION_SUMMARY: "Résumé d'une section",
  REPHRASING: "Reformulation",
  CONTENT_IMPROVEMENT: "Amélioration d'un contenu existant",
};

export type PromptTemplateSummary = {
  id: string;
  organizationId: string;
  taskType: string;
  name: string;
  description?: string;
  outputMode: string;
  structuredSchemaKey?: string;
  archivedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptVersionSummary = {
  id: string;
  organizationId: string;
  promptTemplateId: string;
  version: number;
  status: string;
  systemPrompt: string;
  userPromptTemplate: string;
  requiredVariables: readonly string[];
  authorUserId: string;
  effectiveFrom?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  taskType: string;
  targetRef?: string;
  parentGenerationId?: string;
  rootGenerationId: string;
  version: number;
  status: string;
  promptTemplateId: string;
  promptVersionId: string;
  promptVersionNumber: number;
  routingPolicyId?: string;
  routingPolicyVersion?: number;
  modelProvider?: string;
  modelKey?: string;
  fallbackLevel: number;
  generatedContent?: string;
  structuredContent?: unknown;
  editedContent?: string;
  editedStructuredContent?: unknown;
  editedBy?: string;
  editedAt?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  estimatedCostAmount?: string;
  currency?: string;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  validatedBy?: string;
  validatedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
};

export function generationStatusBadgeClass(status: string): string {
  switch (status) {
    case "GENERATED":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "GENERATING":
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export const GENERATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  GENERATING: "Génération en cours",
  GENERATED: "Générée",
  FAILED: "Échouée",
  CANCELLED: "Annulée",
};
