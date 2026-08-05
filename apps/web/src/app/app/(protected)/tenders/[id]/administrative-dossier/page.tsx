import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import { ensureAdministrativeDossierAction } from "../../../../administrative-dossier-actions";
import type { AdministrativeDossierCapabilities, AdministrativeDossierSummary } from "../../../../../../lib/administrative-dossier-types";
import { ADMINISTRATIVE_DOSSIER_STATUS_LABELS, administrativeDossierStatusBadgeClass } from "../../../../../../lib/administrative-dossier-types";
import { ApiErrorState } from "../../../api-error-state";

export const metadata: Metadata = { title: "Dossier administratif — TenderOS" };

/** Sprint 8C Phase 1 — un dossier existe toujours dès qu'un Tender existe : contrairement aux 9
 *  types de livrables (opération plus lourde, bouton "Ensure" explicite), la création idempotente
 *  du dossier administratif est déclenchée automatiquement ici, côté serveur. */
export default async function AdministrativeDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  try {
    await ensureAdministrativeDossierAction(tenderId);
    const [dossier, capabilities] = await Promise.all([
      appApiFetch<AdministrativeDossierSummary>(`/api/v1/tenders/${tenderId}/administrative-dossier`),
      appApiFetch<AdministrativeDossierCapabilities>(`/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Dossier administratif</h1>
            <p className="text-sm text-neutral-600">
              TenderOS assiste la constitution du dossier sans garantir juridiquement sa conformité — la vérification finale reste
              humaine.
            </p>
          </div>
          <span className={`w-fit rounded px-2 py-1 text-xs font-medium ${administrativeDossierStatusBadgeClass(dossier.status)}`}>
            {ADMINISTRATIVE_DOSSIER_STATUS_LABELS[dossier.status] ?? dossier.status}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Complétude</span>
            <p className="text-lg font-semibold text-neutral-900">{dossier.completionPercentage}%</p>
          </div>
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Validation humaine</span>
            <p className="text-lg font-semibold text-neutral-900">
              {dossier.validationStatus === "VALIDATED" ? "Validé" : dossier.validationStatus === "OUTDATED" ? "Périmée" : "Non validé"}
            </p>
          </div>
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Signature</span>
            <p className="text-sm text-neutral-600">Non gérée à ce stade (phase ultérieure)</p>
          </div>
        </div>

        {capabilities.blockers.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {capabilities.blockers.map((blocker, index) => (
              <li key={index} role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href={`/app/tenders/${tenderId}/administrative-dossier/checklist`} className="w-fit rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
            Ouvrir la checklist →
          </Link>
          <Link href={`/app/tenders/${tenderId}/administrative-dossier/structured`} className="w-fit rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700">
            Groupement, DC1/DC2/DUME, sous-traitance, acte d&apos;engagement, pouvoirs →
          </Link>
        </div>
      </div>
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }
}
