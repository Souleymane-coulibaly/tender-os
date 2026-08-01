"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { activatePromptVersionAction, archivePromptTemplateAction, createPromptVersionAction, type FormActionState } from "../../../../generation-actions";

const INITIAL_STATE: FormActionState = {};

export function CreatePromptVersionForm({ templateId }: { templateId: string }) {
  const action = createPromptVersionAction.bind(null, templateId);
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Nouvelle version</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor="systemPrompt" className="text-sm font-medium text-neutral-700">
          Prompt système *
        </label>
        <textarea id="systemPrompt" name="systemPrompt" required rows={3} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="userPromptTemplate" className="text-sm font-medium text-neutral-700">
          Prompt utilisateur * (variables : <code>{"{{tender.title}}"}</code>, <code>{"{{client.name}}"}</code>,{" "}
          <code>{"{{analysis.scoringCriteria}}"}</code>, …)
        </label>
        <textarea id="userPromptTemplate" name="userPromptTemplate" required rows={6} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer la version (brouillon)"}
      </button>
    </form>
  );
}

export function PromptVersionActivateButton({ templateId, versionId }: { templateId: string; versionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleActivate() {
    setIsPending(true);
    const result = await activatePromptVersionAction(templateId, versionId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleActivate}
        disabled={isPending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Activation..." : "Activer"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ArchivePromptTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleArchive() {
    setIsPending(true);
    const result = await archivePromptTemplateAction(templateId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
        Archiver
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleArchive}
          disabled={isPending}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Archivage..." : "Confirmer l'archivage"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
          Annuler
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
