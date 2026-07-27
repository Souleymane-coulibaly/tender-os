"use client";

import { useActionState, useState } from "react";
import {
  createLotAction,
  deleteLotAction,
  reorderLotsAction,
  restoreLotAction,
  updateLotAction,
  type FormActionState,
} from "../../../actions";
import type { TenderLot } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

function LotEditForm({ tenderId, lot, onCancel }: { tenderId: string; lot: TenderLot; onCancel: () => void }) {
  const boundAction = updateLotAction.bind(null, tenderId, lot.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <li className="border-b border-neutral-100 py-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input
          name="title"
          type="text"
          required
          defaultValue={lot.title}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="estimatedAmount"
          type="text"
          defaultValue={lot.estimatedAmount}
          placeholder="Montant estime"
          className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
        >
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
        {state.error ? (
          <p role="alert" className="w-full text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </li>
  );
}

function LotRow({
  tenderId,
  lot,
  canManage,
  isFirst,
  isLast,
  onReorder,
  onDeleted,
}: {
  tenderId: string;
  lot: TenderLot;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onReorder: (direction: "up" | "down") => void;
  onDeleted: (lot: TenderLot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (editing) {
    return <LotEditForm tenderId={tenderId} lot={lot} onCancel={() => setEditing(false)} />;
  }

  return (
    <li className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 text-sm">
      <div>
        <span className="font-medium text-neutral-900">
          Lot {lot.lotNumber} — {lot.title}
        </span>
        {lot.estimatedAmount ? <span className="ml-2 text-neutral-600">{lot.estimatedAmount}</span> : null}
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      {/* AUDIT-005 : les roles en lecture seule ne voient aucune action de mutation — le
          backend reste de toute facon l'unique autorite reelle (tender:update revalide). */}
      {canManage ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isFirst || isPending}
            onClick={() => onReorder("up")}
            aria-label="Monter"
            className="rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast || isPending}
            onClick={() => onReorder("down")}
            aria-label="Descendre"
            className="rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            Modifier
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={async () => {
              setIsPending(true);
              const result = await deleteLotAction(tenderId, lot.id);
              setIsPending(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              onDeleted(lot);
            }}
            className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Supprimer
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Pas d'ecran dedie aux lots supprimes en V1 (conception Lots §G) : la restauration n'est
 * proposee que juste apres une suppression, via cette bannière "Annuler" — le seul moment ou
 * le frontend connait deja l'identifiant d'un lot supprime sans nouvel endpoint de listing.
 * AUDIT-005 : `canManage` masque toute action de creation/modification/suppression/restauration/
 * reordonnancement pour les roles en lecture seule (Viewer/Reviewer/Executive/External/ReadOnly) —
 * un simple confort d'affichage, jamais l'autorite reelle (revalidee par tender:update cote API).
 */
export function LotsSection({
  tenderId,
  lots,
  canManage,
}: {
  tenderId: string;
  lots: TenderLot[];
  canManage: boolean;
}) {
  const boundCreateAction = createLotAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundCreateAction, INITIAL_STATE);
  const [justDeleted, setJustDeleted] = useState<TenderLot | null>(null);
  const [reorderError, setReorderError] = useState<string | undefined>();

  async function handleReorder(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lots.length) return;

    const reordered = [...lots];
    const moved = reordered[index]!;
    reordered[index] = reordered[targetIndex]!;
    reordered[targetIndex] = moved;

    const result = await reorderLotsAction(
      tenderId,
      reordered.map((lot) => lot.id),
    );
    setReorderError(result.error);
  }

  async function handleUndo() {
    if (!justDeleted) return;
    const result = await restoreLotAction(tenderId, justDeleted.id);
    if (!result.error) {
      setJustDeleted(null);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Lots</h2>
      {canManage && justDeleted ? (
        <div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Lot « {justDeleted.title} » supprime.</span>
          <button type="button" onClick={handleUndo} className="font-medium underline">
            Annuler
          </button>
        </div>
      ) : null}
      {reorderError ? (
        <p role="alert" className="text-xs text-red-600">
          {reorderError}
        </p>
      ) : null}
      {lots.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun lot.</p>
      ) : (
        <ul>
          {lots.map((lot, index) => (
            <LotRow
              key={lot.id}
              tenderId={tenderId}
              lot={lot}
              canManage={canManage}
              isFirst={index === 0}
              isLast={index === lots.length - 1}
              onReorder={(direction) => handleReorder(index, direction)}
              onDeleted={(deletedLot) => setJustDeleted(deletedLot)}
            />
          ))}
        </ul>
      )}
      {canManage ? (
        <form action={formAction} className="flex items-end gap-2">
          <input
            name="lotNumber"
            type="text"
            required
            placeholder="N°"
            className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <input
            name="title"
            type="text"
            required
            placeholder="Titre du lot..."
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
          >
            Ajouter
          </button>
          {state.error ? (
            <p role="alert" className="text-xs text-red-600">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
