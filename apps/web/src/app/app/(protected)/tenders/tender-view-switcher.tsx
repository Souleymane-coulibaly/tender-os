import Link from "next/link";

const ITEM_CLASSES = "rounded-md px-3 py-1 font-medium transition";
const ACTIVE_CLASSES = "bg-tenderos-navy text-white";
const INACTIVE_CLASSES = "text-tenderos-slate hover:bg-tenderos-light hover:text-tenderos-navy";

/** Bascule Liste / Kanban en conservant les filtres actifs dans l'URL (mission §9). */
export function TenderViewSwitcher({ active, queryString }: { active: "list" | "board"; queryString: string }) {
  const suffix = queryString ? `?${queryString}` : "";

  return (
    <div className="flex gap-1 rounded-lg border border-tenderos-navy/15 bg-white p-1 text-sm">
      <Link href={`/app/tenders${suffix}`} className={`${ITEM_CLASSES} ${active === "list" ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}>
        Liste
      </Link>
      <Link href={`/app/tenders/board${suffix}`} className={`${ITEM_CLASSES} ${active === "board" ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}>
        Kanban
      </Link>
    </div>
  );
}
