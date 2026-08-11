import type { ClientAccountSummary } from "../../../lib/client-portfolio-types";

export type DashboardFiltersState = {
  clientId?: string | undefined;
  periodDays?: string | undefined;
};

/** Même motif GET que KnowledgeFilters/ClientFilters — l'URL reste la source de vérité du filtre
 *  actif (mission §12/§43/§69). `clients` ne contient QUE les clients accessibles à l'acteur
 *  courant (déjà filtré côté API, jamais tous les clients de l'organisation par défaut). */
export function DashboardFilters({ values, clients }: { values: DashboardFiltersState; clients: ClientAccountSummary[] }) {
  return (
    <form method="GET" action="/app" className="flex flex-wrap items-end gap-3">
      {clients.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="clientId" className="text-xs uppercase tracking-wide text-neutral-500">
            Client
          </label>
          <select id="clientId" name="clientId" defaultValue={values.clientId ?? ""} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Tous mes clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="periodDays" className="text-xs uppercase tracking-wide text-neutral-500">
          Période
        </label>
        <select id="periodDays" name="periodDays" defaultValue={values.periodDays ?? "30"} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="7">7 jours</option>
          <option value="30">30 jours</option>
          <option value="90">90 jours</option>
        </select>
      </div>
      <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
        Appliquer
      </button>
    </form>
  );
}
