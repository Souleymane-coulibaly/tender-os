"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "../../../../../components/ui";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { updateCandidateIdentityAction, type CapabilityActionState } from "../../../candidate-capability-actions";

const INITIAL_STATE: CapabilityActionState = {};

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — gap F2-02 : édition de l'identité juridique depuis la fiche
 * CandidateCompany V2.
 *
 * Ferme la dernière raison d'aller écrire dans le Legacy `CompanyProfile` : jusqu'ici l'identité
 * candidate était en lecture seule, alors que CandidateCompany est censée être LA surface
 * d'administration. Toutes les écritures passent par `PATCH /candidate-companies/:id`.
 *
 * AUCUNE VALIDATION MÉTIER CÔTÉ INTERFACE. Le SIREN et le numéro de TVA ne sont pas revalidés ici :
 * le backend porte la validation Luhn / clé française, et une seconde implémentation divergerait
 * au premier ajustement. Le champ est simplement borné en longueur, comme le schéma.
 *
 * Le SIRET est absent volontairement : il appartient à l'établissement (`CandidateEstablishment`),
 * jamais à la personne morale — même discipline que le domaine (mission CCV2 §7).
 */
export function CandidateIdentityForm({ company }: { company: CandidateCompanySummary }) {
  const [open, setOpen] = useState(false);
  const boundAction = updateCandidateIdentityAction.bind(null, company.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  // Apres un enregistrement REUSSI, le formulaire se referme et laisse voir l'identite mise a jour.
  // Le laisser ouvert donnerait a penser que rien n'a ete enregistre, et obligerait a cliquer
  // « Annuler » apres avoir sauvegarde — ce que le mot « Annuler » contredit exactement.
  useEffect(() => {
    if (state.savedAt) setOpen(false);
  }, [state.savedAt]);

  if (!open) {
    return (
      <div className="mt-4">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Modifier l&apos;identité
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3 rounded-lg border border-tenderos-mist p-4">
      <h3 className="text-sm font-semibold text-tenderos-navy">Modifier l&apos;identité juridique</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="identity-name" name="name" label="Nom *" defaultValue={company.name} required maxLength={200} />
        <Field id="identity-legalName" name="legalName" label="Raison sociale" defaultValue={company.legalName ?? ""} maxLength={240} />
        <Field id="identity-tradeName" name="tradeName" label="Nom commercial" defaultValue={company.tradeName ?? ""} maxLength={240} />
        <Field id="identity-siren" name="siren" label="SIREN" defaultValue={company.siren ?? ""} maxLength={9} hint="9 chiffres" />
        <Field id="identity-vatNumber" name="vatNumber" label="TVA intracommunautaire" defaultValue={company.vatNumber ?? ""} maxLength={20} />
        <Field id="identity-legalForm" name="legalForm" label="Forme juridique" defaultValue={company.legalForm ?? ""} maxLength={120} />
      </div>
      <p className="text-xs text-tenderos-slate">
        Le SIRET se déclare au niveau de l&apos;établissement, dans l&apos;onglet Établissements.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  required,
  maxLength,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  maxLength: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-tenderos-slate">
        {label}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
      />
      {hint ? <span className="text-xs text-tenderos-slate">{hint}</span> : null}
    </div>
  );
}
