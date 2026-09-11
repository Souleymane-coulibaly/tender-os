"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Select } from "../../../../../components/ui";
import { updateOpportunityAction } from "../../../opportunity-actions";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";

/**
 * Checkpoint 2.1-A5 — même discipline que `CandidateCompanySection` (Tender) : une Opportunity peut
 * légitimement n'avoir aucune CandidateCompany rattachée (mission §17 "état normal"), jamais un
 * repli silencieux sur le Client. Réutilise `updateOpportunityAction` existant (PATCH partiel),
 * jamais une seconde route inventée.
 *
 * Design System — cellule de la grille d'informations de la fiche (pas une `Card` à elle seule).
 * `min-w-0` sur la cellule, le formulaire et le `<select>` : un `<select>` se dimensionne sur son
 * option la plus large et pousserait sinon la grille hors de l'écran (même borne que côté Tender).
 */
export function OpportunityCandidateCompanySection({
  opportunityId,
  currentCandidateCompany,
  availableCandidateCompanies,
  canManage,
}: {
  opportunityId: string;
  currentCandidateCompany: CandidateCompanySummary | null;
  availableCandidateCompanies: CandidateCompanySummary[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const otherCandidates = availableCandidateCompanies.filter((company) => company.id !== currentCandidateCompany?.id);

  async function handleSelect(formData: FormData): Promise<void> {
    const candidateCompanyId = formData.get("candidateCompanyId");
    if (typeof candidateCompanyId !== "string" || !candidateCompanyId) return;
    setIsPending(true);
    setError(undefined);
    const { error: actionError } = await updateOpportunityAction(opportunityId, { candidateCompanyId });
    setIsPending(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    setOpen(false);
  }

  return (
    <div className="flex min-w-0 flex-col items-start">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Entreprise candidate</h2>
      {currentCandidateCompany ? (
        <Link href={`/app/candidate-companies/${currentCandidateCompany.id}`} className="break-words text-sm text-tenderos-navy hover:underline">
          {candidateCompanyDisplayName(currentCandidateCompany)}
        </Link>
      ) : (
        <p className="text-sm italic text-warning-fg">Non sélectionnée</p>
      )}

      {canManage && open ? (
        <form action={handleSelect} className="mt-2 flex w-full min-w-0 flex-col gap-2 rounded-lg bg-warning-bg p-3">
          <Select name="candidateCompanyId" required defaultValue="" className="min-w-0 truncate">
            <option value="" disabled>
              Sélectionner...
            </option>
            {otherCandidates.map((company) => (
              <option key={company.id} value={company.id}>
                {candidateCompanyDisplayName(company)}
              </option>
            ))}
          </Select>
          {error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Changement..." : "Confirmer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : canManage && otherCandidates.length > 0 ? (
        <Button type="button" variant="link" onClick={() => setOpen(true)} className="mt-1 text-xs">
          {currentCandidateCompany ? "Changer d'entreprise candidate" : "Sélectionner une entreprise candidate"}
        </Button>
      ) : null}
    </div>
  );
}
