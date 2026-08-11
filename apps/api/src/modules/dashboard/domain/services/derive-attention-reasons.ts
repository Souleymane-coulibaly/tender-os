import { ReadinessStatus } from "../../../tenders";
import { ResponsePackageStatus } from "../../../response-package";
import { AttentionReason, DeadlineBucket } from "../enums";

/** Mission §33/§64 — un package est considéré "non prêt" tant qu'il n'a pas atteint READY (aucun
 *  blocage REQUIRED+APPLICABLE+MISSING restant, règle Sprint 14 déjà appliquée en amont dans le
 *  statut dénormalisé) ou une étape ultérieure ; jamais un second calcul de blocage ici. */
const NOT_READY_PACKAGE_STATUSES: readonly ResponsePackageStatus[] = [ResponsePackageStatus.Draft, ResponsePackageStatus.InReview, ResponsePackageStatus.Invalidated];

export type DeriveAttentionReasonsInput = Readonly<{
  deadlineBucket: DeadlineBucket | undefined;
  incompleteChecklistCount: number;
  readinessStatus: ReadinessStatus;
  packageStatuses: readonly ResponsePackageStatus[];
}>;

/**
 * Mission §30/§31 — règle déterministe combinant deadline + blocages réels + statut de
 * préparation, jamais un score IA opaque (mission §31 "éviter un score IA opaque"). Un Tender
 * sans dossier de réponse créé n'est PAS signalé pour ce seul motif (`packageStatuses` vide) : une
 * analyse en cours légitimement sans package n'est pas "à risque" de ce point de vue — seul un
 * package RÉELLEMENT existant et non prêt compte (mission §32/§115, ne jamais inventer un blocage).
 */
export function deriveAttentionReasons(input: DeriveAttentionReasonsInput): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (input.deadlineBucket === DeadlineBucket.Overdue) {
    reasons.push(AttentionReason.DeadlineOverdue);
  } else if (input.deadlineBucket === DeadlineBucket.Today || input.deadlineBucket === DeadlineBucket.Tomorrow) {
    reasons.push(AttentionReason.DeadlineUrgent);
  }

  if (input.incompleteChecklistCount > 0) {
    reasons.push(AttentionReason.ChecklistIncomplete);
  }

  if (input.packageStatuses.some((status) => NOT_READY_PACKAGE_STATUSES.includes(status))) {
    reasons.push(AttentionReason.PackageNotReady);
  }

  if (input.readinessStatus === ReadinessStatus.NotReady) {
    reasons.push(AttentionReason.ReadinessAtRisk);
  }

  return reasons;
}
