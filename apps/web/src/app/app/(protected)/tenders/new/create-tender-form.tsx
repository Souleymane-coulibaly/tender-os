"use client";

import { useActionState } from "react";
import { Button, FieldWrapper, Input, Select, fieldControlClasses } from "../../../../../components/ui";
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
 *
 * Champs obligatoires : `FieldWrapper` + contrôle natif plutôt que `Input`/`Select` `required`,
 * pour que le libellé visible et le nom accessible restent exactement « Titre * » etc. (les
 * composants ajouteraient leur propre astérisque).
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
      <FieldWrapper label="Client *">
        <select
          id="clientAccountId"
          name="clientAccountId"
          required
          defaultValue={clients[0]?.id ?? ""}
          className={fieldControlClasses({})}
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </FieldWrapper>

      <div className="flex flex-col gap-1.5">
        {/* L'aide reste HORS du libellé : dans `FieldWrapper`, elle entrerait dans le nom accessible
            (« Entreprise candidate * L'entité juridique… »). */}
        <FieldWrapper label="Entreprise candidate *">
          {/* Volontairement SANS `defaultValue` pré-sélectionné : l'utilisateur désigne, le produit
              ne devine pas. L'identifiant technique n'est jamais saisi — il n'est que la valeur de
              l'option, l'utilisateur ne voit que la raison sociale. */}
          <select
            id="candidateCompanyId"
            name="candidateCompanyId"
            required
            defaultValue=""
            aria-describedby="candidateCompanyId-hint"
            className={fieldControlClasses({})}
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
        </FieldWrapper>
        <p id="candidateCompanyId-hint" className="text-xs text-tenderos-slate">
          L&apos;entité juridique qui répond à cet appel d&apos;offres — distincte du client ci-dessus.
        </p>
      </div>

      <FieldWrapper label="Titre *">
        <input id="title" name="title" type="text" required className={fieldControlClasses({})} />
      </FieldWrapper>

      <Input label="Référence" id="reference" name="reference" type="text" />

      <Input label="Acheteur (texte libre)" id="buyerName" name="buyerName" type="text" />

      <div className="flex flex-col gap-2">
        <Select label="Acheteur (fiche structuree)" id="buyerId" name="buyerId" defaultValue="">
          <option value="">— Aucun —</option>
          {buyers.map((buyer) => (
            <option key={buyer.id} value={buyer.id}>
              {buyer.name}
            </option>
          ))}
        </Select>
        <BuyerQuickCreateForm />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Type de procédure" id="procedureType" name="procedureType" type="text" />
        <FieldWrapper label="Type de marché *">
          <select
            id="marketType"
            name="marketType"
            required
            defaultValue={DEFAULT_TENDER_MARKET_TYPE}
            className={fieldControlClasses({})}
          >
            {MARKET_TYPES.map((value) => (
              <option key={value} value={value}>
                {MARKET_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </FieldWrapper>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Montant estimé"
          id="estimatedAmount"
          name="estimatedAmount"
          type="text"
          inputMode="decimal"
          placeholder="50000"
        />
        <Input label="Date limite de remise" id="submissionDeadline" name="submissionDeadline" type="date" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FieldWrapper label="Pays *">
          <select id="country" name="country" required defaultValue={DEFAULT_TENDER_COUNTRY} className={fieldControlClasses({})}>
            {TENDER_COUNTRIES.map((value) => (
              <option key={value} value={value}>
                {TENDER_COUNTRY_LABELS[value]}
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper label="Langue *">
          <select id="language" name="language" required defaultValue={DEFAULT_TENDER_LANGUAGE} className={fieldControlClasses({})}>
            {TENDER_LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {TENDER_LANGUAGE_LABELS[value]}
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper label="Devise *">
          <select id="currency" name="currency" required defaultValue={DEFAULT_TENDER_CURRENCY} className={fieldControlClasses({})}>
            {TENDER_CURRENCIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </FieldWrapper>
      </div>

      {/* Creation manuelle uniquement dans cette tranche (aucun connecteur BOAMP/TED) :
          affichage seul, jamais soumis. La source est fixee a MANUAL par createTenderAction
          cote serveur (jamais lue depuis le formulaire) — un champ desactive n'est qu'une
          restriction visuelle, jamais une garantie de securite ; aucun input (visible ou
          hidden) ne porte donc ce nom ici, pour qu'aucune valeur falsifiee ne puisse jamais
          etre envoyee. */}
      <Select label="Source" disabled defaultValue={DEFAULT_TENDER_SOURCE}>
        <option value={DEFAULT_TENDER_SOURCE}>{TENDER_SOURCE_LABELS[DEFAULT_TENDER_SOURCE]}</option>
      </Select>

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending} className="self-start">
        {isPending ? "Création..." : "Créer l'appel d'offres"}
      </Button>
    </form>
  );
}
