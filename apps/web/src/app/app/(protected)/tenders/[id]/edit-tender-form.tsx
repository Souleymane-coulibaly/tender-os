"use client";

import { useActionState } from "react";
import { updateTenderAction, type FormActionState } from "../../../actions";
import { BuyerQuickCreateForm } from "../buyer-quick-create-form";
import {
  AWARD_TYPE_LABELS,
  AWARD_TYPES,
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
  type Tender,
  type TenderCurrencyOption,
  type TenderSource,
} from "../../../../../lib/tenders-types";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import { Textarea } from "../../../../../components/ui/textarea";

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

function toBooleanSelectValue(value: boolean | undefined): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

export function EditTenderForm({ tender, buyers }: { tender: Tender; buyers: Buyer[] }) {
  const boundAction = updateTenderAction.bind(null, tender.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const currentSource = (tender.source ?? DEFAULT_TENDER_SOURCE) as TenderSource;
  const currentCurrency = (tender.currency ?? DEFAULT_TENDER_CURRENCY) as TenderCurrencyOption;
  const isKnownCurrency = (TENDER_CURRENCIES as readonly string[]).includes(currentCurrency);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-title" className="text-sm font-medium text-tenderos-navy">
          Titre *
        </label>
        <Input id="edit-title" name="title" type="text" required defaultValue={tender.title} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-reference" className="text-sm font-medium text-tenderos-navy">
          Référence
        </label>
        <Input
          id="edit-reference"
          name="reference"
          type="text"
          defaultValue={tender.reference ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-buyerName" className="text-sm font-medium text-tenderos-navy">
          Acheteur (texte libre — compatibilite V1)
        </label>
        <Input
          id="edit-buyerName"
          name="buyerName"
          type="text"
          defaultValue={tender.buyerName ?? ""}
        />
      </div>

      {/* V2 Sprint 3 §5 — acheteur structure (Buyer), jamais un ClientAccount. Distinct de
          buyerName (V1, texte libre conserve ci-dessus) : les deux champs coexistent. */}
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-buyerId" className="text-sm font-medium text-tenderos-navy">
          Acheteur (fiche structuree)
        </label>
        <Select id="edit-buyerId" name="buyerId" defaultValue={tender.buyerId ?? ""}>
          <option value="">— Aucun —</option>
          {buyers.map((buyer) => (
            <option key={buyer.id} value={buyer.id}>
              {buyer.name}
            </option>
          ))}
        </Select>
        <BuyerQuickCreateForm tenderId={tender.id} />
      </div>

      <fieldset className="flex flex-col gap-4 rounded border border-tenderos-navy/10 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
          Marche — complements (V2 Sprint 3)
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-awardType" className="text-sm font-medium text-tenderos-navy">
              Type d&apos;attribution
            </label>
            <Select id="edit-awardType" name="awardType" defaultValue={tender.awardType ?? ""}>
              <option value="">— Non précisé —</option>
              {AWARD_TYPES.map((value) => (
                <option key={value} value={value}>
                  {AWARD_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-submissionDeadlineTimezone"
              className="text-sm font-medium text-tenderos-navy"
            >
              Fuseau horaire de la date limite
            </label>
            <Input
              id="edit-submissionDeadlineTimezone"
              name="submissionDeadlineTimezone"
              type="text"
              placeholder="Europe/Paris"
              defaultValue={tender.submissionDeadlineTimezone ?? "Europe/Paris"}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-minimumAmount" className="text-sm font-medium text-tenderos-navy">
              Montant minimum
            </label>
            <Input
              id="edit-minimumAmount"
              name="minimumAmount"
              type="text"
              inputMode="decimal"
              defaultValue={tender.minimumAmount ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-maximumAmount" className="text-sm font-medium text-tenderos-navy">
              Montant maximum
            </label>
            <Input
              id="edit-maximumAmount"
              name="maximumAmount"
              type="text"
              inputMode="decimal"
              defaultValue={tender.maximumAmount ?? ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-questionsDeadline"
              className="text-sm font-medium text-tenderos-navy"
            >
              Date limite des questions
            </label>
            <Input
              id="edit-questionsDeadline"
              name="questionsDeadline"
              type="date"
              defaultValue={toDateInputValue(tender.questionsDeadline)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-visitDate" className="text-sm font-medium text-tenderos-navy">
              Date de visite
            </label>
            <Input
              id="edit-visitDate"
              name="visitDate"
              type="date"
              defaultValue={toDateInputValue(tender.visitDate)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-visitMandatory" className="text-sm font-medium text-tenderos-navy">
              Visite obligatoire
            </label>
            <Select
              id="edit-visitMandatory"
              name="visitMandatory"
              defaultValue={toBooleanSelectValue(tender.visitMandatory)}
            >
              <option value="">— Non précisé —</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-isFrameworkAgreement"
              className="text-sm font-medium text-tenderos-navy"
            >
              Accord-cadre
            </label>
            <Select
              id="edit-isFrameworkAgreement"
              name="isFrameworkAgreement"
              defaultValue={toBooleanSelectValue(tender.isFrameworkAgreement)}
            >
              <option value="">— Non précisé —</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-variantsAllowed"
              className="text-sm font-medium text-tenderos-navy"
            >
              Variantes autorisées
            </label>
            <Select
              id="edit-variantsAllowed"
              name="variantsAllowed"
              defaultValue={toBooleanSelectValue(tender.variantsAllowed)}
            >
              <option value="">— Non précisé —</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-submissionPlatformUrl"
            className="text-sm font-medium text-tenderos-navy"
          >
            URL de la plateforme de dépôt
          </label>
          <Input
            id="edit-submissionPlatformUrl"
            name="submissionPlatformUrl"
            type="url"
            defaultValue={tender.submissionPlatformUrl ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-internalNotes" className="text-sm font-medium text-tenderos-navy">
            Notes internes
          </label>
          <Textarea
            id="edit-internalNotes"
            name="internalNotes"
            rows={3}
            defaultValue={tender.internalNotes ?? ""}
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-procedureType" className="text-sm font-medium text-tenderos-navy">
            Type de procédure
          </label>
          <Input
            id="edit-procedureType"
            name="procedureType"
            type="text"
            defaultValue={tender.procedureType ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-marketType" className="text-sm font-medium text-tenderos-navy">
            Type de marché *
          </label>
          <Select
            id="edit-marketType"
            name="marketType"
            required
            defaultValue={tender.marketType ?? DEFAULT_TENDER_MARKET_TYPE}
          >
            {MARKET_TYPES.map((value) => (
              <option key={value} value={value}>
                {MARKET_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-estimatedAmount" className="text-sm font-medium text-tenderos-navy">
            Montant estimé
          </label>
          <Input
            id="edit-estimatedAmount"
            name="estimatedAmount"
            type="text"
            inputMode="decimal"
            defaultValue={tender.estimatedAmount ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-submissionDeadline"
            className="text-sm font-medium text-tenderos-navy"
          >
            Date limite de remise
          </label>
          <Input
            id="edit-submissionDeadline"
            name="submissionDeadline"
            type="date"
            defaultValue={toDateInputValue(tender.submissionDeadline)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-country" className="text-sm font-medium text-tenderos-navy">
            Pays *
          </label>
          <Select
            id="edit-country"
            name="country"
            required
            defaultValue={tender.country ?? DEFAULT_TENDER_COUNTRY}
          >
            {TENDER_COUNTRIES.map((value) => (
              <option key={value} value={value}>
                {TENDER_COUNTRY_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-language" className="text-sm font-medium text-tenderos-navy">
            Langue *
          </label>
          <Select
            id="edit-language"
            name="language"
            required
            defaultValue={tender.language ?? DEFAULT_TENDER_LANGUAGE}
          >
            {TENDER_LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {TENDER_LANGUAGE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-currency" className="text-sm font-medium text-tenderos-navy">
            Devise *
          </label>
          <Select
            id="edit-currency"
            name="currency"
            required
            defaultValue={isKnownCurrency ? currentCurrency : DEFAULT_TENDER_CURRENCY}
          >
            {TENDER_CURRENCIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-tenderos-navy">Source</span>
        {/* Provenance de l'appel d'offres : affichage seul, jamais soumis. Correction securite —
            updateTenderAction n'envoie jamais de champ "source" (le backend conserve alors la
            valeur existante) : un select desactive n'est qu'une restriction visuelle, jamais une
            garantie de securite, donc aucun input (visible ou hidden) ne porte ce nom ici. Sans
            cela, une requete forgee aurait pu faire passer une saisie manuelle pour un import
            BOAMP/TED en falsifiant un simple champ hidden. */}
        <Select
          aria-label="Source"
          disabled
          defaultValue={currentSource}
          className="bg-tenderos-light text-tenderos-slate"
        >
          <option value={currentSource}>
            {TENDER_SOURCE_LABELS[currentSource] ?? currentSource}
          </option>
        </Select>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="self-start" variant="primary" size="sm">
        {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
      </Button>
    </form>
  );
}
