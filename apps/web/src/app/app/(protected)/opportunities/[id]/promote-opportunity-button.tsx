"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Textarea } from "../../../../../components/ui";
import { promoteOpportunityAction } from "../../../opportunity-actions";

/** Promotion Opportunity -> Tender (mission §20-22) — crée TOUJOURS un nouveau Tender, jamais une
 *  transformation de l'Opportunity elle-même. Idempotente : un second clic après succès redirige
 *  simplement vers le même Tender déjà créé, jamais un second. */
export function PromoteOpportunityButton({
  opportunityId,
  hasCandidateCompany,
}: {
  opportunityId: string;
  /** Checkpoint CCV2-G.1 (POLICY A) — une Opportunity sans entreprise candidate ne peut plus
   *  produire de Tender : `CreateTenderUseCase` refuse desormais (CANDIDATE_COMPANY_REQUIRED). */
  hasCandidateCompany: boolean;
}) {
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

  // Checkpoint CCV2-G.1 (POLICY A) — sans entreprise candidate, la promotion echouerait cote API.
  // On le DIT ici plutot que de laisser l'utilisateur decouvrir un 422 apres coup, et on l'oriente
  // vers la section de selection DEJA presente sur cette page — jamais une seconde UI candidate.
  // Le bouton reste neanmoins la garde d'affichage : l'autorite reste le backend.
  if (!hasCandidateCompany) {
    return (
      <Alert tone="warning" title="Entreprise candidate requise">
        Un appel d&apos;offres désigne l&apos;entité juridique qui y répond. Sélectionnez
        l&apos;entreprise candidate de cette opportunité ci-dessus avant de la promouvoir — elle
        ne peut jamais être déduite du client.
      </Alert>
    );
  }

  // Encadré d'état (contient un champ et l'action) : boîte aux jetons `success`, pas une `Alert`.
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-success-bg p-4">
      <p className="text-sm text-success-fg">
        Cette opportunité peut être promue en appel d&apos;offres. La promotion crée un NOUVEAU dossier appel d&apos;offres et rattache automatiquement le client et l&apos;entreprise candidate déjà sélectionnés.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      {requiresJustification ? (
        <Textarea
          label="Justification du contournement d'affectation"
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          rows={2}
          placeholder="Motif : pourquoi agir sans affectation CLIENT_MANAGER sur ce client ?"
        />
      ) : null}
      <Button
        type="button"
        variant="primary"
        disabled={isPending || (requiresJustification && justification.trim().length === 0)}
        onClick={handlePromote}
        className="self-start"
      >
        {isPending ? "Promotion…" : "Promouvoir en appel d'offres"}
      </Button>
    </section>
  );
}
