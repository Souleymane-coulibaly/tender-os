import type { Metadata } from "next";
import { MARKET_TYPE_LABELS, marketTypeBadgeClass, SOURCE_LABELS } from "../../../../../lib/market-watch-types";
import { fetchExternalTender } from "../../../market-watch-actions";
import { ApiErrorState } from "../../api-error-state";
import { PromoteButton } from "./promote-button";

export const metadata: Metadata = { title: "Détail du marché — TenderOS" };

function formatDate(value: string | undefined): string {
  if (!value) return "Non communiquée";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function formatAmount(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return "Non communiqué";
  return `${new Intl.NumberFormat("fr-FR").format(value)} ${currency ?? "EUR"}`;
}

export default async function ExternalTenderDetailPage({ params }: { params: Promise<{ externalTenderId: string }> }) {
  const { externalTenderId } = await params;

  let tender;
  try {
    tender = await fetchExternalTender(externalTenderId);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{tender.title}</h1>
        <p className="text-sm text-neutral-600">{tender.buyerName ?? "Acheteur non communiqué"}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 font-medium ${marketTypeBadgeClass(tender.marketType)}`}>{MARKET_TYPE_LABELS[tender.marketType] ?? tender.marketType}</span>
          <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">{SOURCE_LABELS[tender.source] ?? tender.source}</span>
        </div>
      </div>

      {tender.description ? <p className="max-w-3xl whitespace-pre-line text-sm text-neutral-700">{tender.description}</p> : null}

      <div className="grid grid-cols-2 gap-4 rounded border border-neutral-200 p-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-neutral-500">Publication</div>
          <div>{formatDate(tender.publicationDate)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Deadline</div>
          <div>{formatDate(tender.submissionDeadline)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Montant estimé</div>
          <div>{formatAmount(tender.estimatedAmount, tender.currency)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Zone</div>
          <div>{tender.city ?? tender.department ?? tender.region ?? tender.country ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Procédure</div>
          <div>{tender.procedureType ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">CPV</div>
          <div>{tender.cpvCodes.length > 0 ? tender.cpvCodes.join(", ") : "—"}</div>
        </div>
      </div>

      {tender.lots && tender.lots.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Lots</h2>
          <ul className="flex flex-col gap-1">
            {tender.lots.map((lot) => (
              <li key={lot.number} className="rounded border border-neutral-200 p-2 text-sm">
                <span className="font-medium">Lot {lot.number}</span>
                {lot.description ? <span className="text-neutral-600"> — {lot.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {tender.sourceUrl ? (
          <a href={tender.sourceUrl} target="_blank" rel="noreferrer noopener" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Voir la source officielle
          </a>
        ) : null}
        <PromoteButton externalTenderId={tender.id} />
      </div>
    </div>
  );
}
