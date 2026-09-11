"use client";

import { useDroppable } from "@dnd-kit/core";
import { Badge } from "../../../../../components/ui";
import { TENDER_STATUS_LABELS, type TenderBoardColumn } from "../../../../../lib/tenders-types";
import { TenderKanbanCard } from "./tender-kanban-card";

export function TenderKanbanColumnView({
  column,
  canDrag,
  pendingTenderId,
}: {
  column: TenderBoardColumn;
  canDrag: boolean;
  pendingTenderId: string | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border transition ${
        isOver ? "border-tenderos-blue/40 bg-tenderos-blue/5 ring-2 ring-tenderos-blue/40" : "border-tenderos-navy/10 bg-tenderos-light/60"
      }`}
    >
      <header className="flex items-center justify-between border-b border-tenderos-navy/10 px-3 py-2">
        <span className="text-sm font-semibold text-tenderos-navy">{TENDER_STATUS_LABELS[column.status]}</span>
        <Badge tone="info">{column.totalCount}</Badge>
      </header>
      <div className="flex min-h-[80px] flex-col gap-2 overflow-y-auto p-2">
        {column.items.length === 0 ? (
          <p className="p-2 text-center text-xs text-tenderos-slate/70">Aucun dossier</p>
        ) : (
          column.items.map((item) => (
            <TenderKanbanCard key={item.id} item={item} canDrag={canDrag} isPending={pendingTenderId === item.id} />
          ))
        )}
      </div>
    </div>
  );
}
