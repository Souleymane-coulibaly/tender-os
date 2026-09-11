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

/** Mission Sprint 8A.2 (bugs #1/#4/#10) — mêmes codes que ceux réellement posés par
 *  GetGenerationCapabilitiesUseCase/ProcessGenerationUseCase côté backend (PROMPT_TEMPLATE_NOT_FOUND
 *  / NO_ACTIVE_PROMPT_VERSION / NO_ACTIVE_ROUTING_POLICY) — jamais un second vocabulaire d'erreur. */
export type GenerationCapabilityReasonCode = "PROMPT_TEMPLATE_NOT_FOUND" | "NO_ACTIVE_PROMPT_VERSION" | "NO_ACTIVE_ROUTING_POLICY";

export type GenerationCapability = {
  taskType: string;
  ready: boolean;
  reasonCode?: GenerationCapabilityReasonCode;
};

/** Un seul mapping FR, utilisé à la fois pour la vérification en amont (capacités) et pour
 *  l'affichage d'un échec déjà survenu (Generation.errorCode) — jamais un message anglais brut,
 *  jamais une pile d'appel ou un détail fournisseur affiché à l'utilisateur (mission §"messages
 *  d'erreur sanitizés"). */
export const GENERATION_CAPABILITY_REASON_LABELS: Record<GenerationCapabilityReasonCode, string> = {
  PROMPT_TEMPLATE_NOT_FOUND:
    "Aucun prompt n'a encore été créé pour ce type de contenu. Un administrateur doit en créer un dans Configuration IA.",
  NO_ACTIVE_PROMPT_VERSION:
    "Aucune version de prompt active pour ce type de contenu. Un administrateur doit en activer une dans Configuration IA.",
  // Plus produit depuis que le modèle est choisi par « Choix des modèles » (P2.3-E4.1) ; gardé pour
  // l'affichage d'anciens échecs — sans renvoyer vers l'onglet Routing, supprimé.
  NO_ACTIVE_ROUTING_POLICY: "La génération IA n'est pas configurée pour ce type de contenu. Contactez le support.",
};

function isGenerationCapabilityReasonCode(value: string): value is GenerationCapabilityReasonCode {
  return value in GENERATION_CAPABILITY_REASON_LABELS;
}

/** Retourne le message FR mappé si le code est connu, sinon un repli générique — jamais
 *  `generation.errorMessage` (anglais, technique) affiché tel quel. */
export function describeGenerationFailureCode(errorCode: string | undefined): string {
  if (errorCode && isGenerationCapabilityReasonCode(errorCode)) {
    return GENERATION_CAPABILITY_REASON_LABELS[errorCode];
  }
  return "La génération a échoué. Réessayez, ou contactez un administrateur si le problème persiste.";
}

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
