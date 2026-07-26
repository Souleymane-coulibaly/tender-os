"use client";

import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import type { TenderBoardItem } from "../../../../../lib/tenders-types";

function readinessBadgeClass(status: TenderBoardItem["readinessStatus"]): string {
  switch (status) {
    case "READY":
      return "bg-green-100 text-green-800";
    case "READY_WITH_WARNINGS":
      return "bg-amber-100 text-amber-800";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-red-100 text-red-800";
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

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-1.5 rounded border border-neutral-200 bg-white p-2.5 text-xs shadow-sm ${
        isDragging ? "opacity-50" : ""
      } ${isPending ? "animate-pulse opacity-70" : ""}`}
      {...(canDrag && !isPending ? { ...listeners, ...attributes, tabIndex: 0, role: "button" } : {})}
      aria-roledescription={canDrag ? "carte deplacable" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/tenders/${item.id}`} className="font-medium text-neutral-900 hover:underline">
          {item.title}
        </Link>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${readinessBadgeClass(item.readinessStatus)}`}>
          {item.readinessScore}
        </span>
      </div>
      {item.reference ? <span className="text-neutral-500">{item.reference}</span> : null}
      {item.buyerName ? <span className="text-neutral-600">{item.buyerName}</span> : null}
      <div className="flex flex-wrap items-center gap-2 text-neutral-500">
        {item.submissionDeadline ? (
          <span className={item.overdue ? "font-medium text-red-700" : undefined}>
            {new Date(item.submissionDeadline).toLocaleDateString("fr-FR")}
            {item.overdue ? " (retard)" : ""}
          </span>
        ) : null}
        {item.openRisksCount > 0 ? <span className="text-red-700">{item.openRisksCount} risque(s)</span> : null}
        {item.incompleteChecklistCount > 0 ? (
          <span>{item.incompleteChecklistCount} a faire</span>
        ) : null}
      </div>
      {!canDrag ? <span className="text-[10px] italic text-neutral-400">Lecture seule</span> : null}
    </div>
  );
}
