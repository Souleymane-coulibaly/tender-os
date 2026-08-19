"use client";

import { useActionState, useState } from "react";
import { changeTenderClientAction, type FormActionState } from "../../../actions";
import { canOfferClientChange, type TenderStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

type AccessibleClient = { id: string; name: string };

/**
 * V2 Sprint 3 §4/§16 — changement CONTROLE du CLIENT (ClientAccount) : jamais fusionne avec la
 * modification des informations generales, propose uniquement tant que la reponse n'a pas
 * vraiment commence (DRAFT/IN_ANALYSIS, miroir de Tender.CANDIDATE_CHANGE_ALLOWED_STATUSES), et
 * uniquement vers une entreprise a laquelle l'acteur a lui-meme acces (la liste fournie ici vient
 * deja de /api/v1/clients, qui ne renvoie que les entreprises accessibles a l'acteur courant — le
 * backend revalide de toute facon l'acces sur l'ancien ET le nouveau client).
 *
 * Checkpoint 2.1-A5 — renomme depuis `CandidateSection`/"Entreprise candidate" : ce composant gere
 * le CLIENT (ClientAccount, relation commerciale/portefeuille) du Tender, jamais la
 * CandidateCompany (l'entité juridique qui répond, voir `CandidateCompanySection`). Les deux
 * concepts restent strictement distincts à l'écran (mission A5 §11/§52).
 */
export function ClientSection({
  tenderId,
  status,
  currentClientAccountId,
  currentClientName,
  accessibleClients,
  canChange,
}: {
  tenderId: string;
  status: TenderStatus;
  currentClientAccountId: string;
  currentClientName: string;
  accessibleClients: AccessibleClient[];
  canChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = changeTenderClientAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const otherClients = accessibleClients.filter((client) => client.id !== currentClientAccountId);
  const offerChange = canChange && canOfferClientChange(status) && otherClients.length > 0;

  return (
    <section className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Client</h2>
      <p className="text-sm text-neutral-900">{currentClientName}</p>

      {offerChange ? (
        open ? (
          <form action={formAction} className="mt-2 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
            <label htmlFor="candidate-clientAccountId" className="text-xs font-medium text-amber-900">
              Nouveau client
            </label>
            <select
              id="candidate-clientAccountId"
              name="clientAccountId"
              required
              defaultValue=""
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="" disabled>
                Selectionner...
              </option>
              {otherClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <label htmlFor="candidate-reason" className="text-xs text-amber-900">
              Motif (facultatif)
            </label>
            <input id="candidate-reason" name="reason" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            {state.error ? (
              <p role="alert" className="text-xs text-red-600">
                {state.error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded bg-amber-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Changement..." : "Confirmer le changement"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100">
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900"
          >
            Changer de client
          </button>
        )
      ) : (
        <p className="text-xs text-neutral-500">
          {canChange ? "Le changement de client n'est plus possible une fois la preparation de la reponse commencee." : null}
        </p>
      )}
    </section>
  );
}
