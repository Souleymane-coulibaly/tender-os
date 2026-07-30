"use client";

import { useActionState } from "react";
import { createTenderAction, type FormActionState } from "../../../actions";
import {
  DEFAULT_TENDER_COUNTRY,
  DEFAULT_TENDER_CURRENCY,
  DEFAULT_TENDER_LANGUAGE,
  DEFAULT_TENDER_MARKET_TYPE,
  DEFAULT_TENDER_SOURCE,
  MARKET_TYPE_LABELS,
  MARKET_TYPES,
  TENDER_COUNTRIES,
  TENDER_COUNTRY_LABELS,
  TENDER_CURRENCIES,
  TENDER_LANGUAGES,
  TENDER_LANGUAGE_LABELS,
  TENDER_SOURCE_LABELS,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function CreateTenderForm() {
  const [state, formAction, isPending] = useActionState(createTenderAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-neutral-700">
          Titre *
        </label>
        <input id="title" name="title" type="text" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reference" className="text-sm font-medium text-neutral-700">
          Reference
        </label>
        <input id="reference" name="reference" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="buyerName" className="text-sm font-medium text-neutral-700">
          Acheteur
        </label>
        <input id="buyerName" name="buyerName" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="procedureType" className="text-sm font-medium text-neutral-700">
            Type de procedure
          </label>
          <input
            id="procedureType"
            name="procedureType"
            type="text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="marketType" className="text-sm font-medium text-neutral-700">
            Type de marche *
          </label>
          <select
            id="marketType"
            name="marketType"
            required
            defaultValue={DEFAULT_TENDER_MARKET_TYPE}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {MARKET_TYPES.map((value) => (
              <option key={value} value={value}>
                {MARKET_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="estimatedAmount" className="text-sm font-medium text-neutral-700">
            Montant estime
          </label>
          <input
            id="estimatedAmount"
            name="estimatedAmount"
            type="text"
            inputMode="decimal"
            placeholder="50000"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="submissionDeadline" className="text-sm font-medium text-neutral-700">
            Date limite de remise
          </label>
          <input
            id="submissionDeadline"
            name="submissionDeadline"
            type="date"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="country" className="text-sm font-medium text-neutral-700">
            Pays *
          </label>
          <select
            id="country"
            name="country"
            required
            defaultValue={DEFAULT_TENDER_COUNTRY}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {TENDER_COUNTRIES.map((value) => (
              <option key={value} value={value}>
                {TENDER_COUNTRY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="language" className="text-sm font-medium text-neutral-700">
            Langue *
          </label>
          <select
            id="language"
            name="language"
            required
            defaultValue={DEFAULT_TENDER_LANGUAGE}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {TENDER_LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {TENDER_LANGUAGE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="currency" className="text-sm font-medium text-neutral-700">
            Devise *
          </label>
          <select
            id="currency"
            name="currency"
            required
            defaultValue={DEFAULT_TENDER_CURRENCY}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {TENDER_CURRENCIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700">Source</span>
        {/* Creation manuelle uniquement dans cette tranche (aucun connecteur BOAMP/TED) :
            affichage seul, jamais soumis. La source est fixee a MANUAL par createTenderAction
            cote serveur (jamais lue depuis le formulaire) — un champ desactive n'est qu'une
            restriction visuelle, jamais une garantie de securite ; aucun input (visible ou
            hidden) ne porte donc ce nom ici, pour qu'aucune valeur falsifiee ne puisse jamais
            etre envoyee. */}
        <select
          aria-label="Source"
          disabled
          defaultValue={DEFAULT_TENDER_SOURCE}
          className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
        >
          <option value={DEFAULT_TENDER_SOURCE}>{TENDER_SOURCE_LABELS[DEFAULT_TENDER_SOURCE]}</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Creation..." : "Creer l'appel d'offres"}
      </button>
    </form>
  );
}
