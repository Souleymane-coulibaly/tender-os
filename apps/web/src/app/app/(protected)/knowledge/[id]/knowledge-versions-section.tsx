"use client";

import { useState } from "react";
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
    <section className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Historique des versions ({versions.length})</h2>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {versions.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune version disponible.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {versions
            .slice()
            .sort((a, b) => b.versionNumber - a.versionNumber)
            .map((version) => (
              <li key={version.id} className="flex items-center justify-between rounded border border-neutral-100 p-2 text-sm">
                <div>
                  <span className="font-medium text-neutral-900">
                    v{version.versionNumber}
                    {version.versionNumber === activeVersionNumber ? (
                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">active</span>
                    ) : null}
                  </span>
                  <p className="text-xs text-neutral-500">
                    {new Date(version.createdAt).toLocaleString("fr-FR")}
                    {version.reason ? ` — ${version.reason}` : ""}
                  </p>
                  {version.validatedAt ? (
                    <p className="text-xs text-emerald-700">Validée le {new Date(version.validatedAt).toLocaleDateString("fr-FR")}</p>
                  ) : null}
                </div>
                {canRestore && version.versionNumber !== activeVersionNumber ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(version.versionNumber)}
                    disabled={isPending}
                    className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Restaurer
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
