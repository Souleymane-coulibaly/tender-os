"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      <label htmlFor="theme-name" className="text-sm font-medium text-neutral-700">
        Nom
      </label>
      <input id="theme-name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />

      <label htmlFor="theme-accent" className="text-sm font-medium text-neutral-700">
        Couleur d&apos;accent
      </label>
      <input id="theme-accent" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-20 rounded border border-neutral-300" />

      <label htmlFor="theme-font" className="text-sm font-medium text-neutral-700">
        Police (optionnelle)
      </label>
      <input id="theme-font" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="ex. Calibri" className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />

      <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le thème"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
