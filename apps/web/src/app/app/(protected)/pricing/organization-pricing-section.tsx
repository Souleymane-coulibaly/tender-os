import { ESTIMATE_DISCLAIMER_TEXT, type CostAggregateSummary, type OrganizationCostSummary } from "../../../../lib/pricing-types";

function CostAggregateCard({ title, aggregate }: { title: string; aggregate: CostAggregateSummary }) {
  const currencies = Object.entries(aggregate.totalsByCurrency);
  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 p-3">
      <span className="text-xs font-medium text-neutral-500">{title}</span>
      {currencies.length === 0 ? (
        <span className="text-sm text-neutral-500">Coût non disponible</span>
      ) : (
        currencies.map(([currency, amount]) => (
          <span key={currency} className="text-lg font-semibold text-neutral-900">
            {amount} {currency}
          </span>
        ))
      )}
      {aggregate.mixedCurrencies ? <p className="text-xs text-amber-700">Plusieurs devises détectées — totaux affichés séparément.</p> : null}
    </div>
  );
}

/**
 * Mission Sprint 7 §"Pricing par organisation" — réservé OWNER/ORGANIZATION_ADMIN, réutilise
 * `GET /pricing/organization/summary` (le backend revalide `PricingPermission.ReadOrganizationSummary`,
 * jamais cette page seule). Jamais mélangé avec le futur Billing (hors périmètre).
 */
export function OrganizationPricingSection({ summary }: { summary: OrganizationCostSummary }) {
  return (
    <div className="flex flex-col gap-6">
      <CostAggregateCard title="Coût IA réel — toute l'organisation" aggregate={summary.technicalCost} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Par client</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.byClient).map(([clientAccountId, aggregate]) => (
            <CostAggregateCard key={clientAccountId} title={`Client ${clientAccountId.slice(0, 8)}`} aggregate={aggregate} />
          ))}
        </div>
        {Object.keys(summary.byClient).length === 0 ? <p className="text-sm text-neutral-600">Aucune donnée de coût pour l&apos;instant.</p> : null}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Par type de tâche IA</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.byTaskType).map(([taskType, aggregate]) => (
            <CostAggregateCard key={taskType} title={taskType} aggregate={aggregate} />
          ))}
        </div>
      </div>

      <p role="note" className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        {ESTIMATE_DISCLAIMER_TEXT}
      </p>
    </div>
  );
}
