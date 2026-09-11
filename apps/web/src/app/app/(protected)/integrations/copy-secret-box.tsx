"use client";

import { useState } from "react";
import { Alert, Button } from "../../../../components/ui";

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
    <Alert tone="warning" title={`${label} — copiez-le maintenant, il ne sera plus jamais affiché.`}>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-tenderos-navy/10 bg-tenderos-light px-2 py-1.5 font-mono text-xs text-tenderos-navy">{value}</code>
        <Button type="button" variant="primary" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? "Copié !" : "Copier"}
        </Button>
      </div>
    </Alert>
  );
}
