"use client";

import { useActionState } from "react";
import { updateTenderAction, type FormActionState } from "../../../actions";
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
  type Tender,
  type TenderCurrencyOption,
  type TenderSource,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

/** Compatible avec les appels d'offres anciens (mission "rester compatible avec les appels
 *  d'offres anciens") — un Tender cree avant l'ajout de ces champs peut ne porter aucune valeur :
 *  on preremplit alors avec les memes defauts qu'une creation manuelle, jamais un champ vide
 *  envoye comme `undefined` qui laisserait la valeur reelle (potentiellement deja definie cote
 *  backend) inchangee de maniere imprevisible pour l'utilisateur. */
function toDateInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function EditTenderForm({ tender }: { tender: Tender }) {
  const boundAction = updateTenderAction.bind(null, tender.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const currentSource = (tender.source ?? DEFAULT_TENDER_SOURCE) as TenderSource;
  const currentCurrency = (tender.currency ?? DEFAULT_TENDER_CURRENCY) as TenderCurrencyOption;
  const isKnownCurrency = (TENDER_CURRENCIES as readonly string[]).includes(currentCurrency);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-title" className="text-sm font-medium text-neutral-700">
          Titre *
        </label>
        <input
          id="edit-title"
          name="title"
          type="text"
          required
          defaultValue={tender.title}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-reference" className="text-sm font-medium text-neutral-700">
          Reference
        </label>
        <input
          id="edit-reference"
          name="reference"
          type="text"
          defaultValue={tender.reference ?? ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-buyerName" className="text-sm font-medium text-neutral-700">
          Acheteur
        </label>
        <input
          id="edit-buyerName"
          name="buyerName"
          type="text"
          defaultValue={tender.buyerName ?? ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-procedureType" className="text-sm font-medium text-neutral-700">
            Type de procedure
          </label>
          <input
            id="edit-procedureType"
            name="procedureType"
            type="text"
            defaultValue={tender.procedureType ?? ""}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-marketType" className="text-sm font-medium text-neutral-700">
            Type de marche *
          </label>
          <select
            id="edit-marketType"
            name="marketType"
            required
            defaultValue={tender.marketType ?? DEFAULT_TENDER_MARKET_TYPE}
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
          <label htmlFor="edit-estimatedAmount" className="text-sm font-medium text-neutral-700">
            Montant estime
          </label>
          <input
            id="edit-estimatedAmount"
            name="estimatedAmount"
            type="text"
            inputMode="decimal"
            defaultValue={tender.estimatedAmount ?? ""}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-submissionDeadline" className="text-sm font-medium text-neutral-700">
            Date limite de remise
          </label>
          <input
            id="edit-submissionDeadline"
            name="submissionDeadline"
            type="date"
            defaultValue={toDateInputValue(tender.submissionDeadline)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-country" className="text-sm font-medium text-neutral-700">
            Pays *
          </label>
          <select
            id="edit-country"
            name="country"
            required
            defaultValue={tender.country ?? DEFAULT_TENDER_COUNTRY}
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
          <label htmlFor="edit-language" className="text-sm font-medium text-neutral-700">
            Langue *
          </label>
          <select
            id="edit-language"
            name="language"
            required
            defaultValue={tender.language ?? DEFAULT_TENDER_LANGUAGE}
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
          <label htmlFor="edit-currency" className="text-sm font-medium text-neutral-700">
            Devise *
          </label>
          <select
            id="edit-currency"
            name="currency"
            required
            defaultValue={isKnownCurrency ? currentCurrency : DEFAULT_TENDER_CURRENCY}
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
        {/* Provenance de l'appel d'offres : affichage seul, jamais soumis. Correction securite —
            updateTenderAction n'envoie jamais de champ "source" (le backend conserve alors la
            valeur existante) : un select desactive n'est qu'une restriction visuelle, jamais une
            garantie de securite, donc aucun input (visible ou hidden) ne porte ce nom ici. Sans
            cela, une requete forgee aurait pu faire passer une saisie manuelle pour un import
            BOAMP/TED en falsifiant un simple champ hidden. */}
        <select
          aria-label="Source"
          disabled
          defaultValue={currentSource}
          className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
        >
          <option value={currentSource}>{TENDER_SOURCE_LABELS[currentSource] ?? currentSource}</option>
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
        {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
