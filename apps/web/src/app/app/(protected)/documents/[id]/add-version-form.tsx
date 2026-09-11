"use client";

import { useActionState } from "react";
import { addDocumentVersionAction, type FormActionState } from "../../../documents-actions";
import { Button, Card, FileInput } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function AddVersionForm({ documentId }: { documentId: string }) {
  const boundAction = addDocumentVersionAction.bind(null, documentId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        {/* `FileInput` rend déjà son propre `<label>` : libellé séparé en `<label htmlFor>`. */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="version-file" className="text-sm font-medium text-tenderos-navy">
            Nouvelle version (fichier)
          </label>
          <FileInput id="version-file" name="file" required />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Dépôt en cours..." : "Déposer une nouvelle version"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
