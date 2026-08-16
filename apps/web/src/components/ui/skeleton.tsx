/**
 * V2 Sprint 25F (homogénéisation UX/UI) — squelette de chargement, mission §25F.75 "éliminer les
 * écrans blancs pendant le chargement". `animate-pulse` respecte déjà `prefers-reduced-motion`
 * globalement (voir `@media (prefers-reduced-motion: reduce)` dans `globals.css`, qui neutralise
 * `animation-duration` pour toute la page).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-tenderos-navy/10 ${className}`} aria-hidden="true" />;
}

/** Squelette d'une carte standard (titre + 3 lignes) — motif le plus courant sur `/app`. */
export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Squelette de tableau (en-tête + N lignes) — pour les listes AO/Knowledge/etc. pendant le chargement. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}
