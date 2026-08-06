"use client";

import { useActionState, useState } from "react";
import { createBuyerAction, type FormActionState } from "../../actions";

const INITIAL_STATE: FormActionState = {};

/**
 * V2 Sprint 3 §5 — creation rapide d'un Acheteur (jamais un ClientAccount, reutilisable par
 * plusieurs Tenders de la meme organisation). Seul le nom est obligatoire (mission "les donnees
 * peuvent etre incompletes ; ne jamais inventer un SIRET"). Partage entre la fiche Tender
 * (rattachement immediat) et la creation d'un nouveau Tender.
 */
export function BuyerQuickCreateForm({ tenderId }: { tenderId?: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = createBuyerAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900"
      >
        + Creer un nouvel acheteur
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="Nom de l'acheteur *"
          className="col-span-2 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input name="siret" type="text" placeholder="SIRET (si connu)" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
        <input name="city" type="text" placeholder="Ville" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
        <input name="contactEmail" type="email" placeholder="Email de contact" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
        <input name="contactPhone" type="text" placeholder="Telephone de contact" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Creation..." : "Creer l'acheteur"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        L&apos;acheteur cree apparaitra dans la liste deroulante ci-dessus apres actualisation de la page.
      </p>
    </form>
  );
}
