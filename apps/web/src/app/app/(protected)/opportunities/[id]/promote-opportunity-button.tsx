"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { promoteOpportunityAction } from "../../../opportunity-actions";

/** Promotion Opportunity -> Tender (mission §20-22) — crée TOUJOURS un nouveau Tender, jamais une
 *  transformation de l'Opportunity elle-même. Idempotente : un second clic après succès redirige
 *  simplement vers le même Tender déjà créé, jamais un second. */
export function PromoteOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Audit Codex round 2 — un OWNER/ORGANIZATION_ADMIN sans affectation CLIENT_MANAGER réelle sur ce
  // client peut tout de même promouvoir via son privilège d'administration, mais uniquement avec une
  // justification explicite (voir `resolveGoNoGoClientAccess`). Le champ n'apparaît QUE lorsque
  // l'API le réclame — jamais affiché par défaut pour le chemin normal CLIENT_MANAGER.
  const [requiresJustification, setRequiresJustification] = useState(false);
  const [justification, setJustification] = useState("");

  async function handlePromote(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const { result, error: actionError, requiresAdminBypassJustification } = await promoteOpportunityAction(opportunityId, { justification: justification.trim() || undefined });
    if (actionError) {
      setError(actionError);
      setRequiresJustification(Boolean(requiresAdminBypassJustification));
      setIsPending(false);
      return;
    }
    if (result) {
      router.push(`/app/tenders/${result.tender.id}`);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded border border-green-200 bg-green-50 p-4">
      <p className="text-sm text-green-800">
        Cette opportunité peut être promue en appel d&apos;offres. La promotion crée un NOUVEAU dossier appel d&apos;offres et rattache automatiquement l&apos;entreprise candidate.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {requiresJustification ? (
        <label className="flex flex-col gap-1 text-xs text-green-900">
          Justification du contournement d&apos;affectation
          <textarea
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            rows={2}
            className="rounded border border-green-300 bg-white p-2 text-sm text-slate-900"
            placeholder="Motif : pourquoi agir sans affectation CLIENT_MANAGER sur ce client ?"
          />
        </label>
      ) : null}
      <button
        type="button"
        disabled={isPending || (requiresJustification && justification.trim().length === 0)}
        onClick={handlePromote}
        className="self-start rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
      >
        {isPending ? "Promotion…" : "Promouvoir en appel d'offres"}
      </button>
    </section>
  );
}
