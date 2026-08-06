import {
  TENDER_COMPLETENESS_CATEGORY_LABELS,
  TENDER_COMPLETENESS_STATUS_LABELS,
  type TenderCompleteness,
  type TenderCompletenessStatus,
} from "../../../../../lib/tenders-types";

const COMPLETENESS_CATEGORIES: (keyof TenderCompleteness)[] = [
  "generalInformation",
  "candidate",
  "buyer",
  "dates",
  "lots",
  "criteria",
  "requestedDocuments",
  "milestones",
  "risks",
];

function badgeClass(status: TenderCompletenessStatus): string {
  switch (status) {
    case "COMPLETE":
      return "bg-green-100 text-green-800";
    case "PARTIAL":
      return "bg-blue-100 text-blue-800";
    case "TO_VERIFY":
      return "bg-amber-100 text-amber-800";
    case "INCONSISTENT":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

/**
 * V2 Sprint 3 §15 — indicateur de completude DETERMINISTE et explicable, par categorie, jamais
 * un score global ni un GO/NO-GO, jamais issu d'une analyse IA. Purement informatif : ne bloque
 * jamais la creation ou la sauvegarde d'un Tender incomplet.
 */
export function CompletenessSection({ completeness }: { completeness: TenderCompleteness }) {
  return (
    <section className="rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Vue d&apos;ensemble — completude</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COMPLETENESS_CATEGORIES.map((category) => {
          const status: TenderCompletenessStatus = completeness[category];
          return (
            <li key={category} className="flex items-center justify-between gap-2 rounded border border-neutral-100 px-2 py-1.5">
              <span className="text-xs text-neutral-700">{TENDER_COMPLETENESS_CATEGORY_LABELS[category]}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}>
                {TENDER_COMPLETENESS_STATUS_LABELS[status]}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs italic text-neutral-500">
        Indicateur informatif : il n&apos;empeche jamais la creation ou la sauvegarde d&apos;un appel d&apos;offres incomplet.
      </p>
    </section>
  );
}
