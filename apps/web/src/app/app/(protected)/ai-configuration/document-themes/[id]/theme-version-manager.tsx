"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input } from "../../../../../../components/ui";
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
            {/* Sélecteur de couleur natif conservé : `Input` imposerait `w-full` et un padding de
                champ texte, inadaptés au nuancier du navigateur. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-theme-version-accent" className="text-sm font-medium text-tenderos-navy">
                Couleur d&apos;accent
              </label>
              <input
                id="new-theme-version-accent"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-20 rounded-lg border border-tenderos-navy/15"
              />
            </div>
            <Input
              id="new-theme-version-font"
              label="Police"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              wrapperClassName="max-w-md"
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
