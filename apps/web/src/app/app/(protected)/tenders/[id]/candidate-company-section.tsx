"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { changeTenderCandidateCompanyAction, type FormActionState } from "../../../actions";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import type { CandidateCompanyResolution } from "../../../candidate-company-actions";
import { canOfferCandidateCompanyChange, type TenderStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

/**
 * Checkpoint 2.1-A5 — section "Entreprise candidate" GENUINE (CandidateCompany, A1-A4), distincte
 * de `ClientSection` (ClientAccount). Mission §17/§57 : un Tender peut légitimement n'avoir AUCUNE
 * CandidateCompany rattachée (legacy jamais rétroactivement rempli, ou choix pas encore fait) —
 * état normal, jamais un crash, jamais un repli silencieux sur le Client.
 *
 * Checkpoint TENDEROS-2.1-CCV2-G.1 — POLICY A. Trois états RÉELLEMENT distincts, jamais confondus :
 *
 *  - `loaded`      : l'entreprise candidate est connue et affichée ;
 *  - `none`        : le Tender n'en désigne AUCUNE — état hérité d'avant CCV2-G.1, signalé comme
 *                    « requise » avec une action de sélection explicite pour les rôles autorisés ;
 *  - `unavailable` : le Tender EN DÉSIGNE une, mais sa lecture a échoué. AUCUNE action de sélection
 *                    n'est proposée ici : inviter à choisir écraserait une attribution valide à
 *                    cause d'une panne passagère (P2-CANDIDATE-FETCH-ERROR).
 *
 * L'identité du CLIENT n'est jamais affichée à la place de celle du candidat, dans aucun des trois.
 *
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — `w-full min-w-0` sur le formulaire, le `<select>` et le champ
 * de motif : un `<select>` se dimensionne sur son option la PLUS LARGE et impose cette largeur
 * intrinsèque à son conteneur. Mesuré, l'ouverture du contrôle poussait la page entière 305 px
 * hors de l'écran à 390 px de large — le corps de page défilait horizontalement, ce que la
 * discipline responsive du produit interdit.
 */
export function CandidateCompanySection({
  tenderId,
  status,
  resolution,
  availableCandidateCompanies,
  canChange,
}: {
  tenderId: string;
  status: TenderStatus;
  resolution: CandidateCompanyResolution;
  availableCandidateCompanies: CandidateCompanySummary[];
  canChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = changeTenderCandidateCompanyAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const currentCandidateCompany = resolution.kind === "loaded" ? resolution.company : null;
  const otherCandidates = availableCandidateCompanies.filter((company) => company.id !== currentCandidateCompany?.id);
  const offerChange = canChange && canOfferCandidateCompanyChange(status) && otherCandidates.length > 0;

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Entreprise candidate</h2>
      {resolution.kind === "loaded" ? (
        <Link href={`/app/candidate-companies/${resolution.company.id}`} className="break-words text-sm font-medium text-tenderos-blue hover:underline">
          {candidateCompanyDisplayName(resolution.company)}
        </Link>
      ) : resolution.kind === "unavailable" ? (
        // Le Tender EN DÉSIGNE une : on le dit, et on ne propose surtout pas d'en choisir une autre.
        <p role="status" className="text-sm text-amber-700">
          Entreprise candidate momentanément indisponible. Elle reste rattachée à cet appel d&apos;offres&nbsp;;
          rechargez la page dans un instant.
        </p>
      ) : (
        <p role="status" className="text-sm font-medium text-amber-800">
          Entreprise candidate requise
        </p>
      )}

      {open ? (
        <form action={formAction} className="mt-2 flex w-full min-w-0 flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <label htmlFor="candidateCompanyId" className="text-xs font-medium text-amber-900">
            {resolution.kind === "loaded" ? "Nouvelle entreprise candidate" : "Sélectionner l'entreprise candidate"}
          </label>
          <select id="candidateCompanyId" name="candidateCompanyId" required defaultValue="" className="w-full min-w-0 truncate rounded border border-neutral-300 px-2 py-1 text-sm">
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
          <input id="candidate-company-reason" name="reason" type="text" className="w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-sm" />
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
      ) : resolution.kind === "unavailable" ? null : offerChange || (resolution.kind === "none" && canChange && availableCandidateCompanies.length > 0) ? (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900">
          {currentCandidateCompany ? "Changer d'entreprise candidate" : "Sélectionner une entreprise candidate"}
        </button>
      ) : resolution.kind === "none" && canChange && availableCandidateCompanies.length === 0 ? (
        <Link href="/app/candidate-companies/new" className="self-start text-xs font-medium text-neutral-700 underline hover:text-neutral-900">
          Créer une entreprise candidate
        </Link>
      ) : resolution.kind === "loaded" ? (
        <p className="text-xs text-neutral-500">
          {canChange ? "Le changement d'entreprise candidate n'est plus possible une fois la préparation de la réponse commencée." : null}
        </p>
      ) : resolution.kind === "none" ? (
        // Rôle sans droit d'attribution : il VOIT que le candidat est requis, mais ne peut pas
        // l'attribuer (mission §15). L'action, elle, reste refusée côté backend.
        <p className="text-xs text-neutral-600">
          {canChange
            ? "Cet appel d'offres est antérieur à l'obligation de désigner une entreprise candidate."
            : "Cet appel d'offres n'a pas d'entreprise candidate. Votre rôle ne permet pas d'en désigner une."}
        </p>
      ) : null}
    </section>
  );
}
