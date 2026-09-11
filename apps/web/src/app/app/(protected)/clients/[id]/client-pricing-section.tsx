import { ESTIMATE_DISCLAIMER_TEXT, type ClientCostSummary, type CostAggregateSummary } from "../../../../../lib/pricing-types";

function CostAggregateRow({ label, aggregate }: { label: string; aggregate: CostAggregateSummary }) {
  const currencies = Object.entries(aggregate.totalsByCurrency);
  return (
    <tr className="border-t border-tenderos-navy/10">
      <td className="py-1 text-tenderos-navy">{label}</td>
      <td className="py-1 text-right text-tenderos-navy">
        {currencies.length === 0 ? (
          <span className="text-tenderos-slate">Coût non disponible</span>
        ) : (
          currencies.map(([currency, amount]) => (
            <span key={currency} className="ml-2">
              {amount} {currency}
            </span>
          ))
        )}
      </td>
    </tr>
  );
}

/**
 * Mission Sprint 7 §"Pricing par client" — vue en lecture seule (aucune création/recalcul ici,
 * réservé à la fiche Tender), réutilise `GET /clients/:id/pricing/summary`. Jamais un montant
 * fusionné entre Tenders de clients différents.
 *
 * Design System — tableau clé/valeur sans en-tête laissé en `<table>` stylé par jetons, même motif
 * que la section Pricing de la fiche appel d'offres ; le disclaimer garde son `role="note"`.
 */
export function ClientPricingSection({ summary }: { summary: ClientCostSummary }) {
  const byTenderEntries = Object.entries(summary.byTender);
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <tbody>
          <CostAggregateRow label="Coût IA réel (tous Tenders)" aggregate={summary.technicalCost} />
          {byTenderEntries.map(([tenderId, aggregate]) => (
            <CostAggregateRow key={tenderId} label={`Tender ${tenderId.slice(0, 8)}`} aggregate={aggregate} />
          ))}
        </tbody>
      </table>
      {byTenderEntries.length === 0 ? <p className="text-sm text-tenderos-slate">Aucune donnée de coût pour ce client pour l&apos;instant.</p> : null}
      <p role="note" className="rounded-lg border border-tenderos-navy/10 bg-tenderos-light p-3 text-xs text-tenderos-slate">
        {ESTIMATE_DISCLAIMER_TEXT}
      </p>
    </div>
  );
}
