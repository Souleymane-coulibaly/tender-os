"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Textarea } from "../../../../../../components/ui";
import {
  activateDeliverableTemplateVersionAction,
  createDeliverableTemplateVersionAction,
} from "../../../../deliverable-actions";
import { VERSION_STATUS_LABELS } from "../../../../../../lib/version-status";

type VersionSummary = { id: string; version: number; status: string };

export function DeliverableTemplateVersionManager({
  templateId,
  defaultSections,
}: {
  templateId: string;
  defaultSections: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sections, setSections] = useState(defaultSections);
  const [createdVersion, setCreatedVersion] = useState<VersionSummary | undefined>();

  async function handleCreateVersion() {
    setIsPending(true);
    setError(undefined);
    const result = await createDeliverableTemplateVersionAction(templateId, sections);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(result.version);
      setIsCreating(false);
    }
  }

  async function handleActivate(versionId: string) {
    setIsPending(true);
    setError(undefined);
    const result = await activateDeliverableTemplateVersionAction(templateId, versionId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(undefined);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {createdVersion ? (
        <Alert tone="warning">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-tenderos-navy">
              Nouvelle version v{createdVersion.version} créée (
              {VERSION_STATUS_LABELS[createdVersion.status] ?? createdVersion.status})
            </span>
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={() => handleActivate(createdVersion.id)}
              className="self-start"
            >
              Activer cette version
            </Button>
          </div>
        </Alert>
      ) : null}

      {!isCreating ? (
        <Button type="button" onClick={() => setIsCreating(true)} className="self-start">
          Créer une nouvelle version
        </Button>
      ) : (
        <Card padding="tight">
          <div className="flex flex-col gap-3">
            <Textarea
              id="new-template-version-sections"
              label="Sections (JSON)"
              value={sections}
              onChange={(e) => setSections(e.target.value)}
              rows={14}
              className="font-mono"
            />
            <div className="flex gap-2">
              <Button type="button" variant="primary" disabled={isPending} onClick={handleCreateVersion}>
                {isPending ? "Création..." : "Créer la version"}
              </Button>
              <Button type="button" onClick={() => setIsCreating(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
