import type { CompanyProfileSummary } from "../../../company-profile";
import { TemporalValidityStatus } from "../../../company-profile";
import type { QuickScoreCompanyProfileInput } from "../../domain/scoring/compute-opportunity-quick-score";

/**
 * Mappe `CompanyProfileSummary` (module `company-profile`) vers la forme plate attendue par les
 * fonctions pures de scoring des DEUX niveaux (`compute-opportunity-quick-score.ts` Niveau 1,
 * `compute-go-no-go-report.ts` Niveau 2) — jamais le type complet transmis au domaine (frontière de
 * module), jamais dupliqué entre les deux orchestrateurs (règle CLAUDE.md "ne jamais dupliquer du
 * code").
 */
export function mapCompanyProfileToQuickScoreInput(summary: CompanyProfileSummary, sector: string | undefined): QuickScoreCompanyProfileInput {
  // ExpiringSoon reste compté comme "valide" (pas encore expiré) — seul EXPIRED bascule côté
  // "expiré" ; NO_EXPIRY est valide sans échéance. Même lecture que la propre catégorisation de
  // company-profile (`ToVerify` != `Expired`).
  const validCertificationCount = summary.certifications.filter((c) => c.temporalStatus !== TemporalValidityStatus.Expired).length;
  const expiredCertificationCount = summary.certifications.filter((c) => c.temporalStatus === TemporalValidityStatus.Expired).length;
  const validInsuranceCount = summary.insurances.filter((i) => i.temporalStatus !== TemporalValidityStatus.Expired).length;
  const expiredInsuranceCount = summary.insurances.filter((i) => i.temporalStatus === TemporalValidityStatus.Expired).length;

  const normalizedSector = sector?.trim().toLowerCase();
  const matchingReferenceCount = normalizedSector
    ? summary.references.filter((ref) => ref.sector?.trim().toLowerCase() === normalizedSector).length
    : 0;

  return {
    hasLegalIdentity: summary.legalIdentity !== null,
    region: undefined,
    city: undefined,
    country: undefined,
    validCertificationCount,
    expiredCertificationCount,
    validInsuranceCount,
    expiredInsuranceCount,
    matchingReferenceCount,
    totalReferenceCount: summary.references.length,
    humanResourceCount: summary.humanResources.length,
    materialResourceCount: summary.materialResources.length,
    identityCompleteness: summary.completeness.identity,
  };
}
