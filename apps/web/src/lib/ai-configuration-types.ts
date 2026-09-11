export type AiModelStatus = "ENABLED" | "DISABLED";

export const AI_MODEL_STATUS_LABELS: Record<AiModelStatus, string> = {
  ENABLED: "Activé",
  DISABLED: "Désactivé",
};

export function aiModelStatusBadgeClass(status: AiModelStatus): string {
  return status === "ENABLED" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700";
}

export type AiModelCapabilities = {
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
};

export type AiModelSummary = {
  id: string;
  provider: string;
  modelKey: string;
  displayName: string;
  status: AiModelStatus;
  capabilities: AiModelCapabilities;
  maxContextTokens?: number;
  enabledForBenchmark: boolean;
  enabledForProduction: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PricingSnapshotSummary = {
  id: string;
  aiModelId: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
};

export type AllowedModelCatalog = Record<string, readonly string[]>;

/** Fournisseur d'un modèle d'IA — `AnalysisProvider` côté API. */
export const AI_PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  MISTRAL: "Mistral AI",
  AZURE_OPENAI: "Azure OpenAI",
};
