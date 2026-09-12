import type { ClientAccountSummary } from "../../../lib/client-portfolio-types";

export type DashboardFiltersState = {
  clientId?: string | undefined;
};

/**
 * V2 Sprint 25 (Dashboard Premium) — le sélecteur "Période" (Sprint 15) est retiré : il ne
 * gouvernait que le widget GO/NO-GO (`goNoGo.periodDays`), lui-même retiré de cette page (voir
 * `dashboard-widgets.tsx`) — le conserver produirait un contrôle sans effet visible, jamais un
 * filtre trompeur. Le backend continue d'accepter `periodDays` (compatibilité), simplement plus
 * exposé ici. "Client" reste : il scope réellement KPI/dossiers prioritaires/échéances/activité.
 */
export function DashboardFilters({ values, clients }: { values: DashboardFiltersState; clients: ClientAccountSummary[] }) {
  if (clients.length === 0) return null;

  return (
    <form data-tour="guide-dashboard-filters" method="GET" action="/app" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="clientId" className="text-xs uppercase tracking-wide text-tenderos-slate">
          Client
        </label>
        <select id="clientId" name="clientId" defaultValue={values.clientId ?? ""} className="rounded-lg border border-tenderos-navy/15 px-2 py-1.5 text-sm text-tenderos-navy">
          <option value="">Tous mes clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-lg border border-tenderos-navy/15 px-3 py-1.5 text-sm text-tenderos-navy hover:bg-tenderos-light">
        Appliquer
      </button>
    </form>
  );
}
