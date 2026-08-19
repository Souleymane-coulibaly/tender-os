"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { changeTenderCandidateCompanyAction, type FormActionState } from "../../../actions";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { canOfferCandidateCompanyChange, type TenderStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

/**
 * Checkpoint 2.1-A5 — section "Entreprise candidate" GENUINE (CandidateCompany, A1-A4), distincte
 * de `ClientSection` (ClientAccount). Mission §17/§57 : un Tender peut légitimement n'avoir AUCUNE
 * CandidateCompany rattachée (legacy jamais rétroactivement rempli, ou choix pas encore fait) —
 * état normal, jamais un crash, jamais un repli silencieux sur le Client.
 */
export function CandidateCompanySection({
  tenderId,
  status,
  currentCandidateCompany,
  availableCandidateCompanies,
  canChange,
}: {
  tenderId: string;
  status: TenderStatus;
  currentCandidateCompany: CandidateCompanySummary | null;
  availableCandidateCompanies: CandidateCompanySummary[];
  canChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = changeTenderCandidateCompanyAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const otherCandidates = availableCandidateCompanies.filter((company) => company.id !== currentCandidateCompany?.id);
  const offerChange = canChange && canOfferCandidateCompanyChange(status) && otherCandidates.length > 0;

  return (
    <section className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Entreprise candidate</h2>
      {currentCandidateCompany ? (
        <Link href={`/app/candidate-companies/${currentCandidateCompany.id}`} className="text-sm font-medium text-tenderos-blue hover:underline">
          {candidateCompanyDisplayName(currentCandidateCompany)}
        </Link>
      ) : (
        <p className="text-sm italic text-amber-700">Non sélectionnée</p>
      )}

      {open ? (
        <form action={formAction} className="mt-2 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <label htmlFor="candidateCompanyId" className="text-xs font-medium text-amber-900">
            {currentCandidateCompany ? "Nouvelle entreprise candidate" : "Sélectionner l'entreprise candidate"}
          </label>
          <select id="candidateCompanyId" name="candidateCompanyId" required defaultValue="" className="rounded border border-neutral-300 px-2 py-1 text-sm">
            <option value="" disabled>
              Selectionner...
            </option>
            {otherCandidates.map((company) => (
              <option key={company.id} value={company.id}>
                {candidateCompanyDisplayName(company)}
              </option>
            ))}
          </select>
          <label htmlFor="candidate-company-reason" className="text-xs text-amber-900">
            Motif (facultatif)
          </label>
          <input id="candidate-company-reason" name="reason" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          {state.error ? (
            <p role="alert" className="text-xs text-red-600">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="rounded bg-amber-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {isPending ? "Changement..." : "Confirmer"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100">
              Annuler
            </button>
          </div>
        </form>
      ) : offerChange || (!currentCandidateCompany && canChange && availableCandidateCompanies.length > 0) ? (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900">
          {currentCandidateCompany ? "Changer d'entreprise candidate" : "Sélectionner une entreprise candidate"}
        </button>
      ) : !currentCandidateCompany && canChange && availableCandidateCompanies.length === 0 ? (
        <Link href="/app/candidate-companies/new" className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900">
          Créer une entreprise candidate
        </Link>
      ) : currentCandidateCompany ? (
        <p className="text-xs text-neutral-500">
          {canChange ? "Le changement d'entreprise candidate n'est plus possible une fois la préparation de la réponse commencée." : null}
        </p>
      ) : null}
    </section>
  );
}
