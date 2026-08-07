"use client";

import { useActionState } from "react";
import { createOpportunityAction, type OpportunityFormActionState } from "../../../opportunity-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";

const INITIAL_STATE: OpportunityFormActionState = {};

export function CreateOpportunityForm({ clients }: { clients: ClientAccountSummary[] }) {
  const [state, formAction, isPending] = useActionState(createOpportunityAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-neutral-700">
          Titre *
        </label>
        <input id="title" name="title" type="text" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="clientAccountId" className="text-sm font-medium text-neutral-700">
          Entreprise candidate
        </label>
        <select id="clientAccountId" name="clientAccountId" defaultValue="" className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">— Aucune (à rattacher plus tard) —</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="buyerName" className="text-sm font-medium text-neutral-700">
          Acheteur (texte libre)
        </label>
        <input id="buyerName" name="buyerName" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sector" className="text-sm font-medium text-neutral-700">
          Secteur
        </label>
        <input id="sector" name="sector" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location" className="text-sm font-medium text-neutral-700">
          Localisation
        </label>
        <input id="location" name="location" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="submissionDeadline" className="text-sm font-medium text-neutral-700">
            Date limite de dépôt
          </label>
          <input id="submissionDeadline" name="submissionDeadline" type="date" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="procedureType" className="text-sm font-medium text-neutral-700">
            Type de procédure
          </label>
          <input id="procedureType" name="procedureType" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="estimatedAmount" className="text-sm font-medium text-neutral-700">
            Montant estimé
          </label>
          <input id="estimatedAmount" name="estimatedAmount" type="text" placeholder="ex. 150000.00" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="currency" className="text-sm font-medium text-neutral-700">
            Devise
          </label>
          <input id="currency" name="currency" type="text" defaultValue="EUR" maxLength={3} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-neutral-700">
          Description
        </label>
        <textarea id="description" name="description" rows={3} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        {isPending ? "Création…" : "Créer l'opportunité"}
      </button>
    </form>
  );
}
