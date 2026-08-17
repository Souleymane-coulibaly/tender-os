import type { ReactNode } from "react";

/**
 * Design System Checkpoint C (Application Primitives) — mission §30 : pattern unique
 * recherche/filtres/tri/vue/reset, destiné aux futurs écrans Opportunités/Appels d'offres/Veille/
 * Bibliothèque/Documents (migration progressive, jamais appliqué rétroactivement dans ce
 * Checkpoint). Slots plutôt qu'une API figée (`search`/`filters`/`actions`) — reste composable avec
 * `Input`/`Select`/`Button` (Checkpoint B) sans leur imposer de forme.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className = "",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-tenderos-navy/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {search}
        {filters}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
