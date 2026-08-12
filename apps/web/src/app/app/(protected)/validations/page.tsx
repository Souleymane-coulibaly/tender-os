import type { Metadata } from "next";
import Link from "next/link";
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
      <div>
        <h1 className="text-xl font-semibold">Mes validations</h1>
        <p className="text-sm text-neutral-600">
          Les demandes de validation où vous êtes désigné approbateur, tous appels d&apos;offres confondus — validation
          interne TenderOS, jamais une signature électronique.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/validations" className={`rounded px-2 py-1 ${!status ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}>
          Toutes
        </Link>
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={`/app/validations?status=${filter.value}`}
            className={`rounded px-2 py-1 ${status === filter.value ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <ValidationsList initialApprovals={approvals} />
    </div>
  );
}
