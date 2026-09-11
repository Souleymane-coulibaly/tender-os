"use client";

import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { Badge, type BadgeTone } from "../../../../../components/ui";
import type { TenderBoardItem } from "../../../../../lib/tenders-types";

/** Statut de preparation -> tone du badge de score (memes seuils que l'ancien
 *  `readinessBadgeClass` local). */
function readinessTone(status: TenderBoardItem["readinessStatus"]): BadgeTone {
  switch (status) {
    case "READY":
      return "success";
    case "READY_WITH_WARNINGS":
      return "warning";
    case "IN_PROGRESS":
      return "info";
    default:
      return "danger";
  }
}

export function TenderKanbanCard({
  item,
  canDrag,
  isPending,
}: {
  item: TenderBoardItem;
  canDrag: boolean;
  isPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !canDrag || isPending,
  });

  // Seul style en ligne conserve : la translation calculee par dnd-kit pendant le glisser.
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-1.5 rounded-xl border border-tenderos-navy/10 bg-white p-3 text-xs shadow-sm transition hover:shadow-md ${
        isDragging ? "opacity-50" : ""
      } ${isPending ? "animate-pulse opacity-70" : ""}`}
      {...(canDrag && !isPending ? { ...listeners, ...attributes, tabIndex: 0, role: "button" } : {})}
      aria-roledescription={canDrag ? "carte deplacable" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/tenders/${item.id}`} className="text-sm font-semibold text-tenderos-navy hover:text-tenderos-blue hover:underline">
          {item.title}
        </Link>
        <span className="shrink-0">
          <Badge tone={readinessTone(item.readinessStatus)}>{item.readinessScore}</Badge>
        </span>
      </div>
      {item.reference ? <span className="text-tenderos-slate">{item.reference}</span> : null}
      {item.buyerName ? <span className="text-tenderos-slate">{item.buyerName}</span> : null}
      <div className="flex flex-wrap items-center gap-2 text-tenderos-slate">
        {item.submissionDeadline ? (
          <span className={item.overdue ? "font-medium text-danger-fg" : undefined}>
            {new Date(item.submissionDeadline).toLocaleDateString("fr-FR")}
            {item.overdue ? " (retard)" : ""}
          </span>
        ) : null}
        {item.openRisksCount > 0 ? <span className="text-danger-fg">{item.openRisksCount} risque(s)</span> : null}
        {item.incompleteChecklistCount > 0 ? (
          <span>{item.incompleteChecklistCount} a faire</span>
        ) : null}
      </div>
      {!canDrag ? <span className="text-xs italic text-tenderos-slate/70">Lecture seule</span> : null}
    </div>
  );
}
