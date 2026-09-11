"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
        <div className="flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <span className="text-sm font-medium text-neutral-900">
            Nouvelle version v{createdVersion.version} créée (
            {VERSION_STATUS_LABELS[createdVersion.status] ?? createdVersion.status})
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleActivate(createdVersion.id)}
            className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Activer cette version
          </button>
        </div>
      ) : null}

      {!isCreating ? (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
        >
          Créer une nouvelle version
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
          <label
            htmlFor="new-template-version-sections"
            className="text-sm font-medium text-neutral-700"
          >
            Sections (JSON)
          </label>
          <textarea
            id="new-template-version-sections"
            value={sections}
            onChange={(e) => setSections(e.target.value)}
            rows={14}
            className="rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleCreateVersion}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Création..." : "Créer la version"}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
