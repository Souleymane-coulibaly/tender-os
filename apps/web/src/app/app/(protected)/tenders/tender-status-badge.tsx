import { TENDER_STATUS_LABELS, type TenderStatus } from "../../../../lib/tenders-types";

/** Un seul point de mapping statut -> couleur, reutilise par la Liste, le Kanban et la
 *  fiche detail (auparavant duplique dans chaque page). */
function toneClass(status: TenderStatus): string {
  switch (status) {
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-700";
    case "LOST":
      return "bg-red-100 text-red-800";
    case "WON":
      return "bg-green-100 text-green-800";
    case "SUBMITTED":
    case "READY_TO_SUBMIT":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${toneClass(status)}`}>
      {TENDER_STATUS_LABELS[status]}
    </span>
  );
}
