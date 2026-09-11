"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "../../../../components/ui";
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
      <Button type="button" variant="link" onClick={() => setOpen(true)} className="self-start text-xs">
        + Créer un nouvel acheteur
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-tenderos-navy/10 bg-tenderos-light p-3">
      {/* Champs sans libelle visible (placeholder seul, comme avant la migration) : `Input` sans
          `label` rend le controle nu, `col-span-2` passe donc directement sur le champ. */}
      <div className="grid grid-cols-2 gap-2">
        <Input name="name" type="text" required placeholder="Nom de l'acheteur *" className="col-span-2" />
        <Input name="siret" type="text" placeholder="SIRET (si connu)" />
        <Input name="city" type="text" placeholder="Ville" />
        <Input name="contactEmail" type="email" placeholder="Email de contact" />
        <Input name="contactPhone" type="text" placeholder="Téléphone de contact" />
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
          {isPending ? "Création..." : "Créer l'acheteur"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      <p className="text-xs text-tenderos-slate">
        L&apos;acheteur cree apparaitra dans la liste deroulante ci-dessus apres actualisation de la page.
      </p>
    </form>
  );
}
