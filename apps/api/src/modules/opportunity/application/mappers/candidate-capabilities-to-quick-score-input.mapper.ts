import type { CandidateIdentitySummary } from "../../../candidate-company";
import type { CandidateCapabilitiesSummary } from "../../../company-profile";
import { TemporalValidityStatus } from "../../../company-profile";
import type { QuickScoreCompanyProfileInput } from "../../domain/scoring/compute-opportunity-quick-score";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E (fermeture de DEFERRED-BE-02) — projette les capacités de la SOT
 * `CandidateCompany` vers la MÊME forme plate que le chemin Legacy.
 *
 * Le scoring lui-même n'est pas touché : `computeOpportunityQuickScore` et
 * `computeGoNoGoReport` restent des fonctions pures inchangées. Seule la SOURCE des compteurs
 * change, ce qui garantit qu'un score candidate et un score legacy restent comparables et qu'aucun
 * critère n'a été inventé pour l'occasion.
 *
 * Les règles de comptage sont reprises à l'identique du mapper Legacy — `EXPIRING_SOON` compte
 * comme valide, seul `EXPIRED` bascule — pour que le passage NEW FLOW ne modifie pas la sémantique
 * d'un score à données égales.
 */

/**
 * Complétude d'identité candidate, exprimée dans le vocabulaire FERMÉ déjà attendu par le scoring
 * (`COMPLETE | TO_VERIFY | PARTIAL | EXPIRED | MISSING`) — jamais un pourcentage, qui serait
 * silencieusement noté 0 par la table de correspondance.
 *
 * `TO_VERIFY` et `EXPIRED` ne sont volontairement JAMAIS produits : ils traduisent, côté Legacy,
 * une date de dernière validation et une péremption qui n'existent pas sur `CandidateCompany`.
 * Les fabriquer donnerait une note fondée sur une donnée inventée. Le SIRET provient de
 * l'établissement PRINCIPAL, seul établissement faisant foi.
 */
function computeCandidateIdentityCompleteness(identity: CandidateIdentitySummary): string {
  const core = [identity.legalName, identity.siren, identity.legalForm, identity.principalEstablishment?.siret];
  const filled = core.filter((value) => value !== undefined && value !== null && `${value}`.trim() !== "").length;
  if (filled === 0) return "MISSING";
  return filled === core.length ? "COMPLETE" : "PARTIAL";
}

export function mapCandidateCapabilitiesToQuickScoreInput(
  identity: CandidateIdentitySummary,
  capabilities: CandidateCapabilitiesSummary,
  sector: string | undefined,
): QuickScoreCompanyProfileInput {
  const validCertificationCount = capabilities.certifications.filter((c) => c.temporalStatus !== TemporalValidityStatus.Expired).length;
  const expiredCertificationCount = capabilities.certifications.filter((c) => c.temporalStatus === TemporalValidityStatus.Expired).length;
  const validInsuranceCount = capabilities.insurances.filter((i) => i.temporalStatus !== TemporalValidityStatus.Expired).length;
  const expiredInsuranceCount = capabilities.insurances.filter((i) => i.temporalStatus === TemporalValidityStatus.Expired).length;

  const normalizedSector = sector?.trim().toLowerCase();
  const matchingReferenceCount = normalizedSector
    ? capabilities.references.filter((reference) => reference.sector?.trim().toLowerCase() === normalizedSector).length
    : 0;

  return {
    // L'identité candidate est portée par `CandidateCompany` (A1), jamais par une
    // `CompanyLegalIdentity` de ClientAccount : la présence d'un SIREN est le signal équivalent.
    hasLegalIdentity: identity.siren !== undefined && identity.siren !== null,
    region: undefined,
    city: undefined,
    country: identity.principalEstablishment?.country,
    validCertificationCount,
    expiredCertificationCount,
    validInsuranceCount,
    expiredInsuranceCount,
    matchingReferenceCount,
    totalReferenceCount: capabilities.references.length,
    humanResourceCount: capabilities.humanResources.length,
    materialResourceCount: capabilities.materialResources.length,
    identityCompleteness: computeCandidateIdentityCompleteness(identity),
  };
}
