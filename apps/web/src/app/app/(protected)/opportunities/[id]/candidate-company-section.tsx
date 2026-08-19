"use client";

import Link from "next/link";
import { useState } from "react";
import { updateOpportunityAction } from "../../../opportunity-actions";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";

/**
 * Checkpoint 2.1-A5 — même discipline que `CandidateCompanySection` (Tender) : une Opportunity peut
 * légitimement n'avoir aucune CandidateCompany rattachée (mission §17 "état normal"), jamais un
 * repli silencieux sur le Client. Réutilise `updateOpportunityAction` existant (PATCH partiel),
 * jamais une seconde route inventée.
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
    <div>
      <h2 className="text-xs font-semibold uppercase text-neutral-500">Entreprise candidate</h2>
      {currentCandidateCompany ? (
        <Link href={`/app/candidate-companies/${currentCandidateCompany.id}`} className="text-sm text-neutral-900 hover:underline">
          {candidateCompanyDisplayName(currentCandidateCompany)}
        </Link>
      ) : (
        <p className="text-sm italic text-amber-700">Non sélectionnée</p>
      )}

      {canManage && open ? (
        <form action={handleSelect} className="mt-2 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <select name="candidateCompanyId" required defaultValue="" className="rounded border border-neutral-300 px-2 py-1 text-sm">
            <option value="" disabled>
              Selectionner...
            </option>
            {otherCandidates.map((company) => (
              <option key={company.id} value={company.id}>
                {candidateCompanyDisplayName(company)}
              </option>
            ))}
          </select>
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
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
      ) : canManage && otherCandidates.length > 0 ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 block text-xs font-medium text-neutral-700 underline hover:text-neutral-900">
          {currentCandidateCompany ? "Changer d'entreprise candidate" : "Sélectionner une entreprise candidate"}
        </button>
      ) : null}
    </div>
  );
}
