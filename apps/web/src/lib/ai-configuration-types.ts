import type { BadgeTone } from "../components/ui";

export type AiModelStatus = "ENABLED" | "DISABLED";

export const AI_MODEL_STATUS_LABELS: Record<AiModelStatus, string> = {
  ENABLED: "Activé",
  DISABLED: "Désactivé",
};

/** Design System — ton du `Badge` de statut d'un modèle IA (remplace l'ancien
 *  `aiModelStatusBadgeClass()`, qui reproduisait à la main les classes de `Badge`). */
export const AI_MODEL_STATUS_TONE: Record<AiModelStatus, BadgeTone> = {
  ENABLED: "success",
  DISABLED: "neutral",
};

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
