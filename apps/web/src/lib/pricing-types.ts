/** Mission Sprint 7 — texte de référence FIXE, jamais paraphrasé. Doit apparaître partout où une
 *  estimation est affichée (mission §"Principe juridique et UX obligatoire"). */
export const ESTIMATE_DISCLAIMER_TEXT =
  "Estimation indicative et non contractuelle. Ce montant est calculé à partir des données " +
  "disponibles, des hypothèses renseignées et des tarifs connus au moment du calcul. Il ne " +
  "constitue ni un prix réel garanti du marché, ni une offre commerciale ferme, ni un engagement " +
  "contractuel. Le montant réel peut varier selon les fournisseurs, les volumes, les conditions " +
  "d'exécution, les ressources mobilisées et les évolutions tarifaires.";

export type BreakdownLineSummary = {
  type: string;
  label: string;
  quantity?: string;
  unit?: string;
  unitPriceAmount?: string;
  unitPriceCurrency?: string;
  amount: string;
  currency: string;
  source: string;
  displayOrder: number;
};

export type PricingEstimateVersionSummary = {
  id: string;
  estimateId: string;
  version: number;
  amount: string;
  currency: string;
  breakdown: BreakdownLineSummary[];
  assumptions: Record<string, unknown>;
  status: string;
  disclaimerVersion: number;
  disclaimerText: string;
  source: string;
  createdBy: string;
  createdAt: string;
  supersededAt?: string;
  recalculationReason?: string;
};

export type PricingEstimateSummary = {
  id: string;
  organizationId: string;
  clientAccountId?: string;
  tenderId?: string;
  type: string;
  status: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  archivedAt?: string;
  currentVersion: PricingEstimateVersionSummary;
};

export type CostAggregateSummary = {
  generationCount: number;
  calculatedCount: number;
  partialCount: number;
  unknownCount: number;
  totalsByCurrency: Record<string, string>;
  mixedCurrencies: boolean;
};

export type TenderCostSummary = {
  tenderId: string;
  technicalCost: CostAggregateSummary;
  byTaskType: Record<string, CostAggregateSummary>;
  activeEstimate?: PricingEstimateSummary;
  disclaimerText: string;
  calculatedAt: string;
};

export type ClientCostSummary = {
  clientAccountId: string;
  technicalCost: CostAggregateSummary;
  byTender: Record<string, CostAggregateSummary>;
  disclaimerText: string;
  calculatedAt: string;
};

export type OrganizationCostSummary = {
  technicalCost: CostAggregateSummary;
  byClient: Record<string, CostAggregateSummary>;
  byTaskType: Record<string, CostAggregateSummary>;
  disclaimerText: string;
  calculatedAt: string;
};

export type CostComparison = {
  estimate: PricingEstimateSummary;
  estimatedAiCostAmount?: string;
  actualAiCostAmount?: string;
  currency?: string;
  absoluteDifference?: string;
  percentageDifference?: string;
  actualStatus: "AVAILABLE" | "UNKNOWN" | "CURRENCY_MISMATCH";
  disclaimerText: string;
  comparedAt: string;
};

export type PreviewGenerationCostResult = {
  amount?: string;
  currency?: string;
  breakdown: BreakdownLineSummary[];
  status: string;
  modelProvider?: string;
  modelKey?: string;
  usedHistoricalAverage: boolean;
  disclaimerVersion: number;
  disclaimerText: string;
  calculatedAt: string;
};

export const PRICING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  CALCULATED: "Calculée",
  PARTIAL: "Partielle",
  UNKNOWN: "Inconnue",
  SUPERSEDED: "Remplacée",
  ARCHIVED: "Archivée",
};

export function pricingStatusBadgeClass(status: string): string {
  switch (status) {
    case "CALCULATED":
      return "bg-green-100 text-green-800";
    case "PARTIAL":
      return "bg-amber-100 text-amber-800";
    case "UNKNOWN":
      return "bg-red-100 text-red-800";
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-500";
    case "SUPERSEDED":
      return "bg-neutral-200 text-neutral-600";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

/** Mission §"Chaque montant doit préciser sa nature" — jamais un simple montant sans contexte. */
export function costDataStatusLabel(status: string): string {
  switch (status) {
    case "CALCULATED":
      return "Réel";
    case "PARTIAL":
      return "Partiel";
    case "UNKNOWN":
      return "Inconnu";
    default:
      return status;
  }
}
