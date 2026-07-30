"use client";

import { useState } from "react";
import { addKnowledgeTagAction, removeKnowledgeTagAction } from "../../../knowledge-actions";
import type { KnowledgeTagSummary } from "../../../../../lib/knowledge-types";

export function KnowledgeTagsManager({
  entryId,
  tags,
  canManage,
}: {
  entryId: string;
  tags: KnowledgeTagSummary[];
  canManage: boolean;
}) {
  const [currentTags, setCurrentTags] = useState(tags);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setIsPending(true);
    const result = await addKnowledgeTagAction(entryId, newLabel.trim());
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setNewLabel("");
    setCurrentTags((previous) => [...previous, { id: crypto.randomUUID(), label: newLabel.trim().toLowerCase(), displayLabel: newLabel.trim(), createdAt: new Date().toISOString() }]);
  }

  async function handleRemove(tagId: string) {
    setIsPending(true);
    const result = await removeKnowledgeTagAction(entryId, tagId);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setCurrentTags((previous) => previous.filter((tag) => tag.id !== tagId));
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Tags</h2>
      <div className="flex flex-wrap items-center gap-2">
        {currentTags.length === 0 ? <span className="text-sm text-neutral-500">Aucun tag.</span> : null}
        {currentTags.map((tag) => (
          <span key={tag.id} className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
            {tag.displayLabel}
            {canManage ? (
              <button
                type="button"
                aria-label={`Retirer le tag ${tag.displayLabel}`}
                onClick={() => handleRemove(tag.id)}
                disabled={isPending}
                className="text-neutral-400 hover:text-red-600"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Ajouter un tag..."
            aria-label="Nouveau tag"
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !newLabel.trim()}
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
