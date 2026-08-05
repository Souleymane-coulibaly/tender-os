import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../../lib/app-api-client";
import type {
  AdministrativeDossierCapabilities,
  ConsortiumSummary,
  Dc1DeclarationSummary,
  Dc2DeclarationWithVersions,
  DumeDeclarationWithVersions,
  EngagementActSummary,
  SigningPowerSummary,
  SubcontractorDeclarationSummary,
} from "../../../../../../../lib/administrative-dossier-types";
import { ApiErrorState } from "../../../../api-error-state";
import { AdministrativeStructuredSection } from "./administrative-structured-section";

export const metadata: Metadata = { title: "Dossier structuré — TenderOS" };

/** Sprint 8C Phase 2 — Groupement, DC1, DC2/DUME (+versions), sous-traitance (DC4), Acte
 *  d'engagement (gel/dégel pricing), Pouvoirs. Les sous-agrégats "un par Tender" (Consortium/DC1/
 *  DC2/DUME/AE) peuvent ne pas encore exister — 404 traité comme "absent", jamais une erreur
 *  bloquante pour la page. */
async function fetchOrNull<T>(path: string): Promise<T | null> {
  try {
    return await appApiFetch<T>(path);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
}

export default async function AdministrativeStructuredPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  try {
    const [capabilities, consortium, dc1, dc2, dume, subcontractors, engagementAct, signingPowers] = await Promise.all([
      appApiFetch<AdministrativeDossierCapabilities>(`/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`),
      fetchOrNull<ConsortiumSummary | null>(`/api/v1/tenders/${tenderId}/administrative-consortium`),
      fetchOrNull<Dc1DeclarationSummary | null>(`/api/v1/tenders/${tenderId}/administrative-dc1`),
      fetchOrNull<Dc2DeclarationWithVersions | null>(`/api/v1/tenders/${tenderId}/administrative-dc2`),
      fetchOrNull<DumeDeclarationWithVersions | null>(`/api/v1/tenders/${tenderId}/administrative-dume`),
      appApiFetch<SubcontractorDeclarationSummary[]>(`/api/v1/tenders/${tenderId}/administrative-subcontractors`),
      fetchOrNull<EngagementActSummary | null>(`/api/v1/tenders/${tenderId}/administrative-engagement-act`),
      appApiFetch<SigningPowerSummary[]>(`/api/v1/tenders/${tenderId}/administrative-signing-powers`),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dossier structuré</h1>
          <p className="text-sm text-neutral-600">
            Groupement, DC1, DC2, DUME, sous-traitance, acte d&apos;engagement et pouvoirs de signature — TenderOS assiste la saisie, la
            vérification finale reste humaine.
          </p>
        </div>
        <AdministrativeStructuredSection
          tenderId={tenderId}
          capabilities={capabilities}
          consortium={consortium}
          dc1={dc1}
          dc2={dc2}
          dume={dume}
          subcontractors={subcontractors}
          engagementAct={engagementAct}
          signingPowers={signingPowers}
        />
      </div>
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }
}
