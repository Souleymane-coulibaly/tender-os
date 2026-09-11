"use client";

import { useState } from "react";
import { Badge, Button, Card } from "../../../../../components/ui";
import { restoreKnowledgeVersionAction } from "../../../knowledge-actions";
import type { KnowledgeEntryVersionSummary } from "../../../../../lib/knowledge-types";

export function KnowledgeVersionsSection({
  entryId,
  initialVersions,
  canRestore,
}: {
  entryId: string;
  initialVersions: KnowledgeEntryVersionSummary[];
  canRestore: boolean;
}) {
  const [versions] = useState(initialVersions);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const activeVersionNumber = Math.max(...versions.map((version) => version.versionNumber), 0);

  async function handleRestore(versionNumber: number) {
    setIsPending(true);
    const result = await restoreKnowledgeVersionAction(entryId, versionNumber);
    setIsPending(false);
    setError(result.error);
  }

  return (
    <Card title={`Historique des versions (${versions.length})`}>
      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
        {versions.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune version disponible.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {versions
              .slice()
              .sort((a, b) => b.versionNumber - a.versionNumber)
              .map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-2 rounded-lg border border-tenderos-navy/10 p-2 text-sm">
                  <div>
                    <span className="inline-flex items-center gap-2 font-medium text-tenderos-navy">
                      v{version.versionNumber}
                      {version.versionNumber === activeVersionNumber ? <Badge tone="info">active</Badge> : null}
                    </span>
                    <p className="text-xs text-tenderos-slate">
                      {new Date(version.createdAt).toLocaleString("fr-FR")}
                      {version.reason ? ` — ${version.reason}` : ""}
                    </p>
                    {version.validatedAt ? (
                      <p className="text-xs text-success-fg">Validée le {new Date(version.validatedAt).toLocaleDateString("fr-FR")}</p>
                    ) : null}
                  </div>
                  {canRestore && version.versionNumber !== activeVersionNumber ? (
                    <Button type="button" size="sm" onClick={() => handleRestore(version.versionNumber)} disabled={isPending} className="shrink-0">
                      Restaurer
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
