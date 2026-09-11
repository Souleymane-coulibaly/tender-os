"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import { changeTenderCandidateCompanyAction, type FormActionState } from "../../../actions";
import {
  candidateCompanyDisplayName,
  type CandidateCompanySummary,
} from "../../../../../lib/candidate-company-types";
import type { CandidateCompanyResolution } from "../../../candidate-company-actions";
import {
  canOfferCandidateCompanyChange,
  type TenderStatus,
} from "../../../../../lib/tenders-types";

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
 * discipline responsive du produit interdit. Ces bornes sont CONSERVÉES à l'identique après le
 * passage au design system : `Select` apporte `w-full`, jamais `min-w-0` ni `truncate`.
 *
 * `id="candidateCompanyId"` est CONSERVÉ : les preuves H.2 (bascule/latence) et H.3 (responsive)
 * ciblent `select#candidateCompanyId` sur cet écran.
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
  const otherCandidates = availableCandidateCompanies.filter(
    (company) => company.id !== currentCandidateCompany?.id,
  );
  const offerChange =
    canChange && canOfferCandidateCompanyChange(status) && otherCandidates.length > 0;

  return (
    <Card title="Entreprise candidate">
      <div className="flex min-w-0 flex-col gap-2">
        {resolution.kind === "loaded" ? (
          <Link
            href={`/app/candidate-companies/${resolution.company.id}`}
            className="break-words text-sm font-medium text-tenderos-blue hover:underline"
          >
            {candidateCompanyDisplayName(resolution.company)}
          </Link>
        ) : resolution.kind === "unavailable" ? (
          // Le Tender EN DÉSIGNE une : on le dit, et on ne propose surtout pas d'en choisir une autre.
          <p role="status" className="text-sm text-warning-fg">
            Entreprise candidate momentanément indisponible. Elle reste rattachée à cet appel
            d&apos;offres&nbsp;; rechargez la page dans un instant.
          </p>
        ) : (
          <p role="status" className="text-sm font-medium text-warning-fg">
            Entreprise candidate requise
          </p>
        )}

        {open ? (
          <form
            action={formAction}
            className="mt-2 flex w-full min-w-0 flex-col gap-2 rounded-lg border border-amber-200 bg-warning-bg p-3"
          >
            <Select
              id="candidateCompanyId"
              name="candidateCompanyId"
              label={
                resolution.kind === "loaded"
                  ? "Nouvelle entreprise candidate"
                  : "Sélectionner l'entreprise candidate"
              }
              required
              defaultValue=""
              className="min-w-0 truncate"
              wrapperClassName="w-full min-w-0"
            >
              <option value="" disabled>
                Sélectionner...
              </option>
              {otherCandidates.map((company) => (
                <option key={company.id} value={company.id}>
                  {candidateCompanyDisplayName(company)}
                </option>
              ))}
            </Select>
            <Input
              name="reason"
              type="text"
              label="Motif (facultatif)"
              className="min-w-0"
              wrapperClassName="w-full min-w-0"
            />
            {state.error ? (
              <p role="alert" className="text-xs text-danger-fg">
                {state.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" size="sm" loading={isPending}>
                Confirmer
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : resolution.kind === "unavailable" ? null : offerChange ||
          (resolution.kind === "none" && canChange && availableCandidateCompanies.length > 0) ? (
          <Button type="button" variant="link" className="self-start" onClick={() => setOpen(true)}>
            {currentCandidateCompany
              ? "Changer d'entreprise candidate"
              : "Sélectionner une entreprise candidate"}
          </Button>
        ) : resolution.kind === "none" && canChange && availableCandidateCompanies.length === 0 ? (
          <Button href="/app/candidate-companies/new" variant="link" className="self-start">
            Créer une entreprise candidate
          </Button>
        ) : resolution.kind === "loaded" ? (
          <p className="text-xs text-tenderos-slate">
            {canChange
              ? "Le changement d'entreprise candidate n'est plus possible une fois la préparation de la réponse commencée."
              : null}
          </p>
        ) : resolution.kind === "none" ? (
          // Rôle sans droit d'attribution : il VOIT que le candidat est requis, mais ne peut pas
          // l'attribuer (mission §15). L'action, elle, reste refusée côté backend.
          <p className="text-xs text-tenderos-slate">
            {canChange
              ? "Cet appel d'offres est antérieur à l'obligation de désigner une entreprise candidate."
              : "Cet appel d'offres n'a pas d'entreprise candidate. Votre rôle ne permet pas d'en désigner une."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
