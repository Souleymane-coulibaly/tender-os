"use client";

import { useActionState } from "react";
import { createTenderAction, type FormActionState } from "../../../actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { BuyerQuickCreateForm } from "../buyer-quick-create-form";
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
  type Buyer,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

/**
 * Checkpoint TENDEROS-2.1-CCV2-G.1 — POLICY A : sélection EXPLICITE de l'entreprise candidate.
 *
 * Les deux listes ne désignent pas la même chose et ne doivent jamais être confondues :
 *  - « Client » = `ClientAccount`, la relation commerciale suivie dans TenderOS ;
 *  - « Entreprise candidate » = `CandidateCompany`, la personne morale qui répond réellement.
 *
 * Aucune n'est déduite de l'autre. Rien n'est pré-sélectionné côté candidat : un choix par défaut
 * serait exactement l'attribution implicite que l'audit CCV2-G interdit.
 */
export function CreateTenderForm({
  clients,
  buyers,
  candidateCompanies,
}: {
  clients: ClientAccountSummary[];
  buyers: Buyer[];
  candidateCompanies: CandidateCompanySummary[];
}) {
  const [state, formAction, isPending] = useActionState(createTenderAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="clientAccountId" className="text-sm font-medium text-neutral-700">
          Client *
        </label>
        <select
          id="clientAccountId"
          name="clientAccountId"
          required
          defaultValue={clients[0]?.id ?? ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="candidateCompanyId" className="text-sm font-medium text-neutral-700">
          Entreprise candidate *
        </label>
        {/* Volontairement SANS `defaultValue` pré-sélectionné : l'utilisateur désigne, le produit
            ne devine pas. L'identifiant technique n'est jamais saisi — il n'est que la valeur de
            l'option, l'utilisateur ne voit que la raison sociale. */}
        <select
          id="candidateCompanyId"
          name="candidateCompanyId"
          required
          defaultValue=""
          aria-describedby="candidateCompanyId-hint"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Sélectionner l&apos;entreprise qui candidate…
          </option>
          {candidateCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {candidateCompanyDisplayName(company)}
            </option>
          ))}
        </select>
        <p id="candidateCompanyId-hint" className="text-xs text-neutral-600">
          L&apos;entité juridique qui répond à cet appel d&apos;offres — distincte du client ci-dessus.
        </p>
      </div>

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
          Acheteur (texte libre)
        </label>
        <input id="buyerName" name="buyerName" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="buyerId" className="text-sm font-medium text-neutral-700">
          Acheteur (fiche structuree)
        </label>
        <select id="buyerId" name="buyerId" defaultValue="" className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">— Aucun —</option>
          {buyers.map((buyer) => (
            <option key={buyer.id} value={buyer.id}>
              {buyer.name}
            </option>
          ))}
        </select>
        <BuyerQuickCreateForm />
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
