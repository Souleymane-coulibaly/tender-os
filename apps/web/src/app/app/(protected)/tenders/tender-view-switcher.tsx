import Link from "next/link";

/** Bascule Liste / Kanban en conservant les filtres actifs dans l'URL (mission §9). */
export function TenderViewSwitcher({ active, queryString }: { active: "list" | "board"; queryString: string }) {
  const suffix = queryString ? `?${queryString}` : "";

  return (
    <div className="flex gap-1 rounded border border-neutral-200 p-1 text-sm">
      <Link
        href={`/app/tenders${suffix}`}
        className={`rounded px-3 py-1 ${active === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
      >
        Liste
      </Link>
      <Link
        href={`/app/tenders/board${suffix}`}
        className={`rounded px-3 py-1 ${active === "board" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
      >
        Kanban
      </Link>
    </div>
  );
}
