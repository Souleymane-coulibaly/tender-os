"use client";

import { useActionState, useState } from "react";
import { Alert } from "../../../../../components/ui/alert";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
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

function LotEditForm({
  tenderId,
  lot,
  onCancel,
}: {
  tenderId: string;
  lot: TenderLot;
  onCancel: () => void;
}) {
  const boundAction = updateLotAction.bind(null, tenderId, lot.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <li className="border-b border-tenderos-navy/10 py-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <Input
          name="title"
          type="text"
          required
          defaultValue={lot.title}
          aria-label="Titre du lot"
          className="min-w-[10rem] flex-1"
        />
        <Input
          name="estimatedAmount"
          type="text"
          defaultValue={lot.estimatedAmount}
          placeholder="Montant estime"
          className="shrink-0 grow-0 basis-40"
        />
        <Button type="submit" variant="primary" size="sm" loading={isPending}>
          Enregistrer
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        {state.error ? (
          <p role="alert" className="w-full text-xs text-danger-fg">
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
    <li className="flex items-center justify-between gap-2 border-b border-tenderos-navy/10 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-tenderos-navy">
          Lot {lot.lotNumber} — {lot.title}
        </span>
        {lot.estimatedAmount ? (
          <span className="ml-2 text-tenderos-slate">{lot.estimatedAmount}</span>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
      {/* AUDIT-005 : les roles en lecture seule ne voient aucune action de mutation — le
          backend reste de toute facon l'unique autorite reelle (tender:update revalide). */}
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFirst || isPending}
            onClick={() => onReorder("up")}
            aria-label="Monter"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLast || isPending}
            onClick={() => onReorder("down")}
            aria-label="Descendre"
          >
            ↓
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={isPending}
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
          >
            Supprimer
          </Button>
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
    <Card title="Lots">
      <div className="flex flex-col gap-2">
        {canManage && justDeleted ? (
          <Alert tone="warning">
            <span className="flex flex-wrap items-center gap-2">
              Lot « {justDeleted.title} » supprime.
              <Button type="button" variant="link" onClick={handleUndo}>
                Annuler
              </Button>
            </span>
          </Alert>
        ) : null}
        {reorderError ? (
          <p role="alert" className="text-xs text-danger-fg">
            {reorderError}
          </p>
        ) : null}
        {lots.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun lot.</p>
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
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <Input
              name="lotNumber"
              type="text"
              required
              placeholder="N°"
              aria-label="Numéro du lot"
              className="shrink-0 grow-0 basis-20"
            />
            <Input
              name="title"
              type="text"
              required
              placeholder="Titre du lot..."
              className="min-w-[10rem] flex-1"
            />
            <Button type="submit" size="sm" loading={isPending}>
              Ajouter
            </Button>
            {state.error ? (
              <p role="alert" className="text-xs text-danger-fg">
                {state.error}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </Card>
  );
}
