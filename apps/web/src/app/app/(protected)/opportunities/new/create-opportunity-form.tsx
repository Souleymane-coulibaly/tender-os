"use client";

import { useActionState } from "react";
import { Button, Card, Input, Select, Textarea } from "../../../../../components/ui";
import { createOpportunityAction, type OpportunityFormActionState } from "../../../opportunity-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import { candidateCompanyDisplayName, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";

const INITIAL_STATE: OpportunityFormActionState = {};

export function CreateOpportunityForm({ clients, candidateCompanies }: { clients: ClientAccountSummary[]; candidateCompanies: CandidateCompanySummary[] }) {
  const [state, formAction, isPending] = useActionState(createOpportunityAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        <Input id="title" name="title" type="text" label="Titre" required />

        <Select id="clientAccountId" name="clientAccountId" label="Client" defaultValue="">
          <option value="">— Aucun (à rattacher plus tard) —</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>

        <Select id="candidateCompanyId" name="candidateCompanyId" label="Entreprise candidate" defaultValue="">
          <option value="">— Aucune (à rattacher plus tard) —</option>
          {candidateCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {candidateCompanyDisplayName(company)}
            </option>
          ))}
        </Select>

        <Input id="buyerName" name="buyerName" type="text" label="Acheteur (texte libre)" />
        <Input id="sector" name="sector" type="text" label="Secteur" />
        <Input id="location" name="location" type="text" label="Localisation" />

        <div className="grid grid-cols-2 gap-4">
          <Input id="submissionDeadline" name="submissionDeadline" type="date" label="Date limite de dépôt" />
          <Input id="procedureType" name="procedureType" type="text" label="Type de procédure" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input id="estimatedAmount" name="estimatedAmount" type="text" label="Montant estimé" placeholder="ex. 150000.00" />
          <Input id="currency" name="currency" type="text" label="Devise" defaultValue="EUR" maxLength={3} />
        </div>

        <Textarea id="description" name="description" label="Description" rows={3} />

        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Création…" : "Créer l'opportunité"}
        </Button>
      </form>
    </Card>
  );
}
