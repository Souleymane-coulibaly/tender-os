"use client";

import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useState } from "react";
import { Alert } from "../../../../../components/ui";
import { changeTenderStatusDirectAction } from "../../../actions";
import { TENDER_STATUS_LABELS, type TenderBoard, type TenderStatus } from "../../../../../lib/tenders-types";
import { TenderKanbanColumnView } from "./tender-kanban-column";

/**
 * Glisser-deposer du Kanban (mission §4) : la mise a jour optimiste ne fait jamais
 * autorite — chaque deplacement declenche changeTenderStatusDirectAction, qui appelle le
 * meme endpoint / meme use case que le changement de statut depuis la fiche Tender
 * (ChangeTenderStatusUseCase valide la transition, les permissions, l'organisation, et
 * ecrit l'audit). En cas de refus, la carte revient a sa colonne d'origine et le message
 * d'erreur renvoye par l'API est affiche tel quel.
 */
export function TenderKanbanBoard({ board, canDrag }: { board: TenderBoard; canDrag: boolean }) {
  const [columns, setColumns] = useState(board.columns);
  const [error, setError] = useState<string | undefined>();
  const [pendingTenderId, setPendingTenderId] = useState<string | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    if (pendingTenderId) return;

    const tenderId = String(event.active.id);
    const targetStatus = event.over?.id as TenderStatus | undefined;
    if (!targetStatus) return;

    const sourceColumn = columns.find((column) => column.items.some((item) => item.id === tenderId));
    const item = sourceColumn?.items.find((candidate) => candidate.id === tenderId);
    if (!sourceColumn || !item || sourceColumn.status === targetStatus) return;

    const previousColumns = columns;
    setError(undefined);
    setPendingTenderId(tenderId);
    setColumns((current) =>
      current.map((column) => {
        if (column.status === sourceColumn.status) {
          return {
            ...column,
            items: column.items.filter((candidate) => candidate.id !== tenderId),
            totalCount: column.totalCount - 1,
          };
        }
        if (column.status === targetStatus) {
          return {
            ...column,
            items: [...column.items, { ...item, status: targetStatus }],
            totalCount: column.totalCount + 1,
          };
        }
        return column;
      }),
    );

    const result = await changeTenderStatusDirectAction(tenderId, targetStatus);
    setPendingTenderId(undefined);

    if (result.error) {
      setColumns(previousColumns);
      setError(
        `Déplacement de "${item.title}" vers ${TENDER_STATUS_LABELS[targetStatus]} refusé : ${result.error}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!canDrag ? (
        <p className="text-xs italic text-tenderos-slate">
          Lecture seule : votre rôle ne permet pas de changer le statut d&apos;un appel d&apos;offres.
        </p>
      ) : null}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <TenderKanbanColumnView
              key={column.status}
              column={column}
              canDrag={canDrag}
              pendingTenderId={pendingTenderId}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
