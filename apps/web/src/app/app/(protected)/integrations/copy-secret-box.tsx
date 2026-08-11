"use client";

import { useState } from "react";

/** Affiche un secret UNE SEULE FOIS (clé API complète / secret webhook), jamais rejoué par l'API
 *  après la création (mission §10/§11/§30). Copie presse-papiers — aucun autre écran du produit
 *  n'a ce besoin avant Sprint 16. */
export function CopySecretBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">{label} — copiez-le maintenant, il ne sera plus jamais affiché.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-amber-200 bg-white px-2 py-1.5 text-xs">{value}</code>
        <button type="button" onClick={handleCopy} className="shrink-0 rounded bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800">
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
    </div>
  );
}
