import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import { SUBCONTRACTOR_PROFILE_STATUSES, SUBCONTRACTOR_PROFILE_STATUS_LABELS, subcontractorProfileStatusBadgeClass, type SubcontractorProfile } from "../../../../lib/subcontractor-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Sous-traitants — TenderOS" };

type SearchParams = { search?: string; status?: string };

/**
 * Mission V2 Sprint 2 §6/§10 — répertoire ORGANISATIONNEL, réutilisable par plusieurs entreprises
 * candidates et Tenders. Explicitement hors périmètre ce sprint : sélection sur un Tender,
 * lot/montant/paiement direct (DC4).
 */
export default async function SubcontractorProfilesListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);

  let profiles: SubcontractorProfile[];
  try {
    profiles = await appApiFetch<SubcontractorProfile[]>(`/api/v1/subcontractor-profiles?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Sous-traitants</h1>
          <p className="text-sm text-neutral-600">{profiles.length} sous-traitant(s) — répertoire de l&apos;organisation, réutilisable pour tous vos appels d&apos;offres.</p>
        </div>
        <Link href="/app/subcontractor-profiles/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Nouveau sous-traitant
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/app/subcontractor-profiles">
        <div className="flex flex-col gap-1">
          <label htmlFor="search" className="text-xs text-neutral-600">
            Recherche
          </label>
          <input id="search" name="search" defaultValue={params.search} placeholder="Raison sociale..." className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs text-neutral-600">
            Statut
          </label>
          <select id="status" name="status" defaultValue={params.status ?? ""} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Tous</option>
            {SUBCONTRACTOR_PROFILE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SUBCONTRACTOR_PROFILE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Filtrer
        </button>
      </form>

      {profiles.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun sous-traitant ne correspond à ces critères.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Raison sociale</th>
                <th className="py-2 pr-4">SIRET</th>
                <th className="py-2 pr-4">Domaines</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/subcontractor-profiles/${profile.id}`} className="font-medium text-neutral-900 hover:underline">
                      {profile.legalName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-neutral-600">{profile.siret ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{profile.domains ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${subcontractorProfileStatusBadgeClass(profile.status)}`}>
                      {SUBCONTRACTOR_PROFILE_STATUS_LABELS[profile.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/subcontractor-profiles/${profile.id}`} className="text-neutral-700 hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
