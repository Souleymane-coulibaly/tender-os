import { Badge, type BadgeTone } from "../../../../components/ui/badge";
import { TENDER_STATUS_LABELS, type TenderStatus } from "../../../../lib/tenders-types";

/** Un seul point de mapping statut -> tone, reutilise par la Liste, le Kanban et la
 *  fiche detail (auparavant duplique dans chaque page). */
function toneFor(status: TenderStatus): BadgeTone {
  switch (status) {
    case "ARCHIVED":
      return "neutral";
    case "LOST":
      return "danger";
    case "WON":
      return "success";
    case "SUBMITTED":
    case "READY_TO_SUBMIT":
      return "info";
    default:
      return "warning";
  }
}

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return <Badge tone={toneFor(status)}>{TENDER_STATUS_LABELS[status]}</Badge>;
}
