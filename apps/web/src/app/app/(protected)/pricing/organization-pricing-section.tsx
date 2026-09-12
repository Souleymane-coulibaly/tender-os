import { Card } from "../../../../components/ui";
import { ESTIMATE_DISCLAIMER_TEXT, type CostAggregateSummary, type OrganizationCostSummary } from "../../../../lib/pricing-types";

function CostAggregateCard({ title, aggregate }: { title: string; aggregate: CostAggregateSummary }) {
  const currencies = Object.entries(aggregate.totalsByCurrency);
  return (
    <Card padding="tight">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-tenderos-slate">{title}</span>
        {currencies.length === 0 ? (
          <span className="text-sm text-tenderos-slate">Coût non disponible</span>
        ) : (
          currencies.map(([currency, amount]) => (
            <span key={currency} className="text-base font-semibold text-tenderos-navy">
              {amount} {currency}
            </span>
          ))
        )}
        {aggregate.mixedCurrencies ? <p className="text-xs text-warning-fg">Plusieurs devises détectées — totaux affichés séparément.</p> : null}
      </div>
    </Card>
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
      <div data-tour="guide-ai-costs-total">
        <CostAggregateCard title="Coût IA réel — toute l'organisation" aggregate={summary.technicalCost} />
      </div>

      <div data-tour="guide-ai-costs-by-client">
        <h3 className="mb-2 text-sm font-semibold text-tenderos-navy">Par client</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.byClient).map(([clientAccountId, aggregate]) => (
            <CostAggregateCard key={clientAccountId} title={`Client ${clientAccountId.slice(0, 8)}`} aggregate={aggregate} />
          ))}
        </div>
        {Object.keys(summary.byClient).length === 0 ? <p className="text-sm text-tenderos-slate">Aucune donnée de coût pour l&apos;instant.</p> : null}
      </div>

      <div data-tour="guide-ai-costs-by-task-type">
        <h3 className="mb-2 text-sm font-semibold text-tenderos-navy">Par type de tâche IA</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.byTaskType).map(([taskType, aggregate]) => (
            <CostAggregateCard key={taskType} title={taskType} aggregate={aggregate} />
          ))}
        </div>
      </div>

      <p data-tour="guide-ai-costs-disclaimer" role="note" className="rounded-lg border border-tenderos-navy/10 bg-tenderos-light p-3 text-xs text-tenderos-slate">
        {ESTIMATE_DISCLAIMER_TEXT}
      </p>
    </div>
  );
}
