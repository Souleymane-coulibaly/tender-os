"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "../../../../../components/ui";
import { createDocumentThemeAction } from "../../../deliverable-actions";

export function CreateDocumentThemeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accentColor, setAccentColor] = useState("#1A56DB");
  const [fontFamily, setFontFamily] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate() {
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await createDocumentThemeAction(name.trim(), accentColor, fontFamily.trim());
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.push(`/app/ai-configuration/document-themes/${result.theme!.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <Input id="theme-name" label="Nom" value={name} onChange={(e) => setName(e.target.value)} wrapperClassName="max-w-md" />

      {/* Sélecteur de couleur natif conservé : `Input` imposerait `w-full` et un padding de champ
          texte, inadaptés au nuancier du navigateur. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="theme-accent" className="text-sm font-medium text-tenderos-navy">
          Couleur d&apos;accent
        </label>
        <input id="theme-accent" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-20 rounded-lg border border-tenderos-navy/15" />
      </div>

      <Input id="theme-font" label="Police (optionnelle)" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="ex. Calibri" wrapperClassName="max-w-md" />

      <Button type="button" variant="primary" disabled={isPending} onClick={handleCreate} className="self-start">
        {isPending ? "Création..." : "Créer le thème"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
