/** Mission Sprint 8A §17/§20 — provenance d'une section incluse dans un export. */
export const ExportSectionSource = {
  Generation: "GENERATION",
  Pricing: "PRICING",
  Manual: "MANUAL",
  Annex: "ANNEX",
} as const;

export type ExportSectionSource = (typeof ExportSectionSource)[keyof typeof ExportSectionSource];

export function isExportSectionSource(value: string): value is ExportSectionSource {
  return (Object.values(ExportSectionSource) as string[]).includes(value);
}
