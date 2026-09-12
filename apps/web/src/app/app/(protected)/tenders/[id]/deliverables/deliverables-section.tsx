"use client";

import Link from "next/link";
import { Badge } from "../../../../../../components/ui/badge";
import { Card } from "../../../../../../components/ui/card";
import {
  DELIVERABLE_TYPE_LABELS,
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusTone,
  type DeliverableSummary,
} from "../../../../../../lib/deliverable-types";

/** Mission Sprint 8A.1 §16 — la page Livrables affiche : nom/type, progression, statut, dernière
 *  modification, nombre de sections/sections validées, action principale. */
export function DeliverablesSection({
  tenderId,
  deliverables,
}: {
  tenderId: string;
  deliverables: DeliverableSummary[];
  actorRole: string | undefined;
}) {
  const ordered = [...deliverables].sort(
    (a, b) =>
      DELIVERABLE_TYPE_LABELS[a.type]?.localeCompare(DELIVERABLE_TYPE_LABELS[b.type] ?? b.type) ??
      0,
  );

  return (
    <div data-tour="guide-tender-deliverables-list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((deliverable) => (
        <Link
          key={deliverable.id}
          href={`/app/tenders/${tenderId}/deliverables/${deliverable.id}`}
          data-tour="guide-tender-deliverables-card"
          className="block"
        >
          <Card interactive padding="tight" className="h-full">
            <div data-tour="guide-tender-deliverables-status" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-tenderos-navy">
                  {DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type}
                </span>
                <Badge tone={deliverableStatusTone(deliverable.status)}>
                  {DELIVERABLE_STATUS_LABELS[deliverable.status] ?? deliverable.status}
                </Badge>
              </div>
              <p className="text-xs text-tenderos-slate">
                Dernière modification : {new Date(deliverable.updatedAt).toLocaleString("fr-FR")}
              </p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
