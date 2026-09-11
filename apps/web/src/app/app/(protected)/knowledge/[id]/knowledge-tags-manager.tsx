"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "../../../../../components/ui";
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
    <Card title="Tags">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {currentTags.length === 0 ? <span className="text-sm text-tenderos-slate">Aucun tag.</span> : null}
          {currentTags.map((tag) => (
            <Badge key={tag.id}>
              {tag.displayLabel}
              {canManage ? (
                // Bouton-icône « × » logé dans la pastille : `Button` (padding, hauteur de bouton)
                // déborderait du badge — contrôle natif conservé, stylé uniquement par jetons.
                <button
                  type="button"
                  aria-label={`Retirer le tag ${tag.displayLabel}`}
                  onClick={() => handleRemove(tag.id)}
                  disabled={isPending}
                  className="text-tenderos-slate/70 transition hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ×
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            {/* `Input` sans label rend le contrôle nu : la largeur est portée par ce conteneur. */}
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Input
                type="text"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="Ajouter un tag..."
                aria-label="Nouveau tag"
              />
            </div>
            <Button type="button" onClick={handleAdd} disabled={isPending || !newLabel.trim()} className="shrink-0">
              Ajouter
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
