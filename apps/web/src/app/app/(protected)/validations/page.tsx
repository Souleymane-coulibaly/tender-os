import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../../../../components/ui";
import { fetchMyApprovals } from "../../workspace-actions";
import type { ApprovalStatus } from "../../../../lib/workspace-types";
import { ApiErrorState } from "../api-error-state";
import { ValidationsList } from "./validations-list";

export const metadata: Metadata = { title: "Mes validations — TenderOS" };

type SearchParams = { status?: string };

const STATUS_FILTERS: { value: ApprovalStatus; label: string }[] = [
  { value: "PENDING", label: "En attente" },
  { value: "APPROVED", label: "Approuvées" },
  { value: "REJECTED", label: "Rejetées" },
  { value: "CHANGES_REQUESTED", label: "Modifications demandées" },
];

/** Filtre de statut : l'actif est plein (navy), les autres discrets — liens de navigation (URL),
 *  jamais des boutons d'action, donc hors `Button` (même convention que la liste des opportunités). */
function filterClasses(active: boolean): string {
  return `rounded-lg px-2 py-1 font-medium transition ${active ? "bg-tenderos-navy text-white" : "border border-tenderos-navy/15 text-tenderos-slate hover:bg-tenderos-light"}`;
}

/** V2 Sprint 18 (mission §63-65) — "Review Center" : par défaut, demandes où l'utilisateur courant
 *  est l'approbateur désigné (`ListMyApprovalsUseCase`, déjà ClientAccess-aware côté API — jamais
 *  un second filtrage de sécurité ici, cette page affiche exactement ce que l'API autorise). */
export default async function MyValidationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const status = params.status as ApprovalStatus | undefined;

  let approvals;
  try {
    approvals = await fetchMyApprovals(status ? { status } : undefined);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        guideKey="validations"
        breadcrumb={[{ label: "Mes validations" }]}
        title="Mes validations"
        description="Les demandes de validation où vous êtes désigné approbateur, tous appels d'offres confondus — validation interne TenderOS, jamais une signature électronique."
      />

      <nav data-tour="guide-validations-filters" className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/validations" className={filterClasses(!status)}>
          Toutes
        </Link>
        {STATUS_FILTERS.map((filter) => (
          <Link key={filter.value} href={`/app/validations?status=${filter.value}`} className={filterClasses(status === filter.value)}>
            {filter.label}
          </Link>
        ))}
      </nav>

      <div data-tour="guide-validations-list">
        <ValidationsList initialApprovals={approvals} />
      </div>
    </div>
  );
}
