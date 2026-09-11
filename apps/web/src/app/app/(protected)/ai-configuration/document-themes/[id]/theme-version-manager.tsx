"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  activateDocumentThemeVersionAction,
  createDocumentThemeVersionAction,
} from "../../../../deliverable-actions";
import { VERSION_STATUS_LABELS } from "../../../../../../lib/version-status";

type VersionSummary = { id: string; version: number; status: string };

export function DocumentThemeVersionManager({
  themeId,
  defaultAccentColor,
  defaultFontFamily,
}: {
  themeId: string;
  defaultAccentColor: string;
  defaultFontFamily: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [accentColor, setAccentColor] = useState(defaultAccentColor);
  const [fontFamily, setFontFamily] = useState(defaultFontFamily);
  const [createdVersion, setCreatedVersion] = useState<VersionSummary | undefined>();

  async function handleCreateVersion() {
    setIsPending(true);
    setError(undefined);
    const result = await createDocumentThemeVersionAction(themeId, accentColor, fontFamily);
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
    const result = await activateDocumentThemeVersionAction(themeId, versionId);
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
            htmlFor="new-theme-version-accent"
            className="text-sm font-medium text-neutral-700"
          >
            Couleur d&apos;accent
          </label>
          <input
            id="new-theme-version-accent"
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-10 w-20 rounded border border-neutral-300"
          />
          <label htmlFor="new-theme-version-font" className="text-sm font-medium text-neutral-700">
            Police
          </label>
          <input
            id="new-theme-version-font"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm"
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
