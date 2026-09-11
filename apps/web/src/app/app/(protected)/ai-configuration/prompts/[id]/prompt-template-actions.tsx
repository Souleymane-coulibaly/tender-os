"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldWrapper, Textarea } from "../../../../../../components/ui";
import { activatePromptVersionAction, archivePromptTemplateAction, createPromptVersionAction, type FormActionState } from "../../../../generation-actions";

const INITIAL_STATE: FormActionState = {};

export function CreatePromptVersionForm({ templateId }: { templateId: string }) {
  const action = createPromptVersionAction.bind(null, templateId);
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  return (
    <Card title="Nouvelle version" padding="tight">
      <form action={formAction} className="flex flex-col gap-3">
        <Textarea label="Prompt système" id="systemPrompt" name="systemPrompt" required rows={3} />
        {/* Libellé riche (balises `<code>`) : `Textarea` n'accepte qu'un libellé texte, d'où
            `FieldWrapper` directement — même rendu, astérisque conservé à sa place d'origine. */}
        <FieldWrapper
          label={
            <>
              Prompt utilisateur
              <span className="ml-0.5 text-danger-fg" aria-hidden="true">
                *
              </span>{" "}
              (variables : <code>{"{{tender.title}}"}</code>, <code>{"{{client.name}}"}</code>, <code>{"{{analysis.scoringCriteria}}"}</code>, …)
            </>
          }
        >
          <Textarea id="userPromptTemplate" name="userPromptTemplate" required rows={6} />
        </FieldWrapper>
        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Création..." : "Créer la version (brouillon)"}
        </Button>
      </form>
    </Card>
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
      <Button type="button" variant="primary" onClick={handleActivate} disabled={isPending}>
        {isPending ? "Activation..." : "Activer"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
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
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Archiver
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="danger" onClick={handleArchive} disabled={isPending}>
          {isPending ? "Archivage..." : "Confirmer l'archivage"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
