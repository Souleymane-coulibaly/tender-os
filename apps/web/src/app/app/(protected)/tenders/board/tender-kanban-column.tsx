"use client";

import { useDroppable } from "@dnd-kit/core";
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
      className={`flex w-72 shrink-0 flex-col rounded border ${isOver ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-sm font-semibold text-neutral-800">{TENDER_STATUS_LABELS[column.status]}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          {column.totalCount}
        </span>
      </header>
      <div className="flex min-h-[80px] flex-col gap-2 overflow-y-auto p-2">
        {column.items.length === 0 ? (
          <p className="p-2 text-center text-xs text-neutral-400">Aucun dossier</p>
        ) : (
          column.items.map((item) => (
            <TenderKanbanCard key={item.id} item={item} canDrag={canDrag} isPending={pendingTenderId === item.id} />
          ))
        )}
      </div>
    </div>
  );
}
