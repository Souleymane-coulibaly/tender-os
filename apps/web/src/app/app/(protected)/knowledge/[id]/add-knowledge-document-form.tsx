"use client";

import { useActionState } from "react";
import { Button, Card, FileInput, Input } from "../../../../../components/ui";
import { addDocumentToEntryAction, type FormActionState } from "../../../knowledge-actions";

const INITIAL_STATE: FormActionState = {};

export function AddKnowledgeDocumentForm({ entryId }: { entryId: string }) {
  const boundAction = addDocumentToEntryAction.bind(null, entryId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Ajouter un document à cette entrée">
      <form action={formAction} className="flex flex-col gap-3">
        <Input label="Tags additionnels (séparés par une virgule)" id="new-doc-tags" name="tags" type="text" />
        {/* `FileInput` rend déjà son propre `<label>` : le libellé du champ reste un `<label htmlFor>`
            séparé (jamais deux `<label>` imbriqués). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-doc-file" className="text-sm font-medium text-tenderos-navy">
            Fichier *
          </label>
          <FileInput id="new-doc-file" name="file" required />
        </div>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Import en cours..." : "Ajouter le document"}
        </Button>
      </form>
    </Card>
  );
}
