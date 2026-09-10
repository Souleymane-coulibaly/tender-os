import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Card } from "../../../../../components/ui/card";
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
  "checklist",
  "milestones",
  "risks",
];

/**
 * Design System — remplace l'ancien `badgeClass()` local. `INCONSISTENT` etait la seule nuance sans
 * jeton semantique propre (`orange-100/800`) : elle rejoint `warning`, deja portee par `TO_VERIFY`.
 * La distinction reste lisible par le LIBELLE, obligatoire dans `Badge` — jamais par la couleur.
 */
const STATUS_TONE: Record<TenderCompletenessStatus, BadgeTone> = {
  COMPLETE: "success",
  PARTIAL: "info",
  TO_VERIFY: "warning",
  INCONSISTENT: "warning",
  MISSING: "neutral",
};

/**
 * V2 Sprint 3 §15 — indicateur de completude DETERMINISTE et explicable, par categorie, jamais
 * un score global ni un GO/NO-GO, jamais issu d'une analyse IA. Purement informatif : ne bloque
 * jamais la creation ou la sauvegarde d'un Tender incomplet.
 */
export function CompletenessSection({ completeness }: { completeness: TenderCompleteness }) {
  return (
    <Card title="Vue d'ensemble — completude">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COMPLETENESS_CATEGORIES.map((category) => {
          const status: TenderCompletenessStatus = completeness[category];
          return (
            <li
              key={category}
              className="flex items-center justify-between gap-2 rounded-lg border border-tenderos-navy/10 px-2 py-1.5"
            >
              <span className="text-xs text-tenderos-navy">
                {TENDER_COMPLETENESS_CATEGORY_LABELS[category]}
              </span>
              <Badge tone={STATUS_TONE[status]}>{TENDER_COMPLETENESS_STATUS_LABELS[status]}</Badge>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs italic text-tenderos-slate">
        Indicateur informatif : il n&apos;empeche jamais la creation ou la sauvegarde d&apos;un
        appel d&apos;offres incomplet.
      </p>
    </Card>
  );
}
