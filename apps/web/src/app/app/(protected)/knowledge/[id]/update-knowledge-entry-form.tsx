"use client";

import { useActionState } from "react";
import { Button, Card, Input, Textarea } from "../../../../../components/ui";
import { updateKnowledgeEntryAction, type FormActionState } from "../../../knowledge-actions";
import type { KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";
import { KnowledgeMetadataFields } from "../knowledge-metadata-fields";

const INITIAL_STATE: FormActionState = {};

export function UpdateKnowledgeEntryForm({ entry }: { entry: KnowledgeEntrySummary }) {
  const boundAction = updateKnowledgeEntryAction.bind(null, entry.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Modifier les métadonnées" description="Chaque modification crée une nouvelle version de l'entrée.">
      <form action={formAction} className="flex flex-col gap-3">
        <Input label="Titre" id="title" name="title" type="text" defaultValue={entry.title} />
        <Textarea label="Description" id="description" name="description" rows={2} defaultValue={entry.description} />
        <Input label="Langue" id="language" name="language" type="text" defaultValue={entry.language} wrapperClassName="w-24" />

        <KnowledgeMetadataFields category={entry.category} defaultValues={entry.metadata} />

        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
