"use client";

import Link from "next/link";
import { DELIVERABLE_TYPE_LABELS, DELIVERABLE_STATUS_LABELS, deliverableStatusBadgeClass, type DeliverableSummary } from "../../../../../../lib/deliverable-types";

/** Mission Sprint 8A.1 §16 — la page Livrables affiche : nom/type, progression, statut, dernière
 *  modification, nombre de sections/sections validées, action principale. */
export function DeliverablesSection({ tenderId, deliverables }: { tenderId: string; deliverables: DeliverableSummary[]; actorRole: string | undefined }) {
  const ordered = [...deliverables].sort((a, b) => DELIVERABLE_TYPE_LABELS[a.type]?.localeCompare(DELIVERABLE_TYPE_LABELS[b.type] ?? b.type) ?? 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((deliverable) => (
        <Link
          key={deliverable.id}
          href={`/app/tenders/${tenderId}/deliverables/${deliverable.id}`}
          className="flex flex-col gap-2 rounded border border-neutral-200 p-4 hover:border-neutral-400 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">{DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${deliverableStatusBadgeClass(deliverable.status)}`}>
              {DELIVERABLE_STATUS_LABELS[deliverable.status] ?? deliverable.status}
            </span>
          </div>
          <p className="text-xs text-neutral-500">Dernière modification : {new Date(deliverable.updatedAt).toLocaleString("fr-FR")}</p>
        </Link>
      ))}
    </div>
  );
}
