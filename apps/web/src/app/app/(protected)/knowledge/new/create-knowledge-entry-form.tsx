"use client";

import { useActionState, useState } from "react";
import { Button, Card, FieldWrapper, Input, Select, Textarea } from "../../../../../components/ui";
import { createKnowledgeEntryAction, type FormActionState } from "../../../knowledge-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import { KNOWLEDGE_CATEGORY_LABELS, type KnowledgeCategory } from "../../../../../lib/knowledge-types";
import { KnowledgeMetadataFields } from "../knowledge-metadata-fields";

const INITIAL_STATE: FormActionState = {};

export function CreateKnowledgeEntryForm({ clients }: { clients: ClientAccountSummary[] }) {
  const [state, formAction, isPending] = useActionState(createKnowledgeEntryAction, INITIAL_STATE);
  const [category, setCategory] = useState<KnowledgeCategory>("OTHER");

  return (
    <Card>
      <form action={formAction} className="flex max-w-2xl flex-col gap-4">
        {/* `FieldWrapper` + contrôle nu plutôt que `label required` : le libellé visible et le nom
            accessible restent exactement « Titre * » / « Catégorie * » (le composant ajouterait son
            propre astérisque). */}
        <FieldWrapper label="Titre *">
          <Input id="title" name="title" type="text" required />
        </FieldWrapper>

        <Select label="Portée" id="clientAccountId" name="clientAccountId" defaultValue="">
          <option value="">Connaissance globale (organisation)</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              Spécifique à {client.name}
            </option>
          ))}
        </Select>

        <Textarea label="Description" id="description" name="description" rows={2} />

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Catégorie *">
            <Select
              id="category"
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}
            >
              {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
          <Input label="Langue" id="language" name="language" type="text" placeholder="fr" />
        </div>

        <Input label="Tags (séparés par une virgule)" id="tags" name="tags" type="text" placeholder="cloud, secteur-public, ISO-27001" />

        <KnowledgeMetadataFields category={category} />

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Création en cours..." : "Créer l'entrée"}
        </Button>
      </form>
    </Card>
  );
}
