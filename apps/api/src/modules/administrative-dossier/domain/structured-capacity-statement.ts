/**
 * Sprint 8C Phase 2 — mission §11/§13 : forme de données PARTAGÉE entre DC2 et DUME (même contenu
 * métier — identité, chiffre d'affaires, capacités, moyens, assurances, certifications — mission
 * "DUME... auto-déclaration européenne de conformité et de capacités", quasi identique au DC2).
 * Jamais dupliquée entre les deux modules de version.
 */
export type RevenueByYear = Readonly<{ year: number; amountValue: number; amountCurrency: string }>;

export type StructuredCapacityStatement = Readonly<{
  legalIdentity?: string | undefined;
  revenueByYear?: readonly RevenueByYear[] | undefined;
  financialCapacity?: string | undefined;
  technicalCapacity?: string | undefined;
  humanResources?: string | undefined;
  technicalResources?: string | undefined;
  insurances?: string | undefined;
  certifications?: string | undefined;
  additionalInfo?: string | undefined;
}>;

export function validateStructuredCapacityStatement(data: StructuredCapacityStatement): StructuredCapacityStatement {
  for (const entry of data.revenueByYear ?? []) {
    if (entry.amountValue < 0) {
      throw new Error("revenueByYear amountValue must not be negative");
    }
  }
  return data;
}
