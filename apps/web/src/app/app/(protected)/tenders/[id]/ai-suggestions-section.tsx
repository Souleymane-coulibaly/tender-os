"use client";

import { useState } from "react";
import {
  applySuggestionAction,
  fetchTenderSuggestions,
  mapSuggestionsAction,
  rejectSuggestionAction,
  type MapSuggestionsResult,
} from "../../../ai-suggestion-actions";
import {
  AI_SUGGESTION_ENTITY_TYPE_LABELS,
  describeSuggestionField,
  formatSuggestionValue,
  isCreationSuggestion,
  type AiSuggestion,
  type ConflictResolution,
} from "../../../../../lib/ai-suggestion-types";
import { Button } from "../../../../../components/ui/button";

const CONFLICT_CHOICES: { value: ConflictResolution; label: string }[] = [
  { value: "KEEP_CURRENT", label: "Conserver la valeur actuelle" },
  { value: "REPLACE", label: "Remplacer par la proposition IA" },
  { value: "MERGE", label: "Fusionner les deux (si possible)" },
];

/**
 * Panneau "Suggestions IA à valider" (V2 Sprint 4 §9-12) — distinct de `AnalysisSection`
 * volontairement : les Findings (ci-dessus) restent une lecture informative des constats IA
 * bruts, jamais modifiables ; ici, chaque ligne est une PROPOSITION de donnée métier qu'un
 * humain doit explicitement accepter, corriger ou rejeter. Aucune suggestion n'est jamais
 * appliquée automatiquement, y compris depuis ce composant.
 */
export function AiSuggestionsSection({
  tenderId,
  initialSuggestions,
  canManage,
}: {
  tenderId: string;
  initialSuggestions: AiSuggestion[];
  canManage: boolean;
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mapResult, setMapResult] = useState<MapSuggestionsResult | undefined>();
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());

  async function refresh(): Promise<void> {
    setSuggestions(await fetchTenderSuggestions(tenderId));
  }

  async function handleGenerate(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const { result, error: actionError } = await mapSuggestionsAction(tenderId);
    if (actionError) {
      setError(actionError);
      setIsPending(false);
      return;
    }
    setMapResult(result);
    await refresh();
    setIsPending(false);
  }

  async function handleApply(
    suggestion: AiSuggestion,
    conflictResolution?: ConflictResolution,
  ): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const state = await applySuggestionAction(tenderId, suggestion.id, conflictResolution);
    if (state.conflict) {
      setConflictIds((prev) => new Set(prev).add(suggestion.id));
      setIsPending(false);
      return;
    }
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    setConflictIds((prev) => {
      const next = new Set(prev);
      next.delete(suggestion.id);
      return next;
    });
    await refresh();
    setIsPending(false);
  }

  async function handleReject(suggestion: AiSuggestion): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const state = await rejectSuggestionAction(tenderId, suggestion.id);
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    await refresh();
    setIsPending(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tenderos-navy">
          Suggestions IA à valider ({suggestions.length})
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={isPending}
            onClick={refresh}
            variant="secondary"
            size="sm"
          >
            Actualiser
          </Button>
          {canManage ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={handleGenerate}
              variant="secondary"
              size="sm"
            >
              Générer les suggestions
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs italic text-tenderos-slate">
        Chaque suggestion est une proposition issue de l&apos;analyse IA du DCE — aucune n&apos;est
        jamais appliquée automatiquement. Vous devez explicitement l&apos;accepter, la corriger ou
        la rejeter.
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}

      {mapResult ? (
        <p className="text-xs text-tenderos-slate">
          {mapResult.alreadyMapped
            ? "Ces constats ont déjà été transformés en suggestions pour cette analyse."
            : `${mapResult.createdCount} suggestion(s) générée(s)${mapResult.skippedCount > 0 ? `, ${mapResult.skippedCount} constat(s) ignoré(s) (donnée insuffisante)` : ""}.`}
        </p>
      ) : null}

      {suggestions.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune suggestion en attente.</p>
      ) : (
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
                  {AI_SUGGESTION_ENTITY_TYPE_LABELS[suggestion.entityType] ?? suggestion.entityType}
                </span>
                {isCreationSuggestion(suggestion.fieldName) ? (
                  <span className="rounded bg-info-bg px-1.5 py-0.5 text-xs text-info-fg">
                    Nouvelle entrée
                  </span>
                ) : (
                  <span className="font-medium text-tenderos-navy">
                    {describeSuggestionField(suggestion.entityType, suggestion.fieldName)}
                  </span>
                )}
                <span className="text-xs text-tenderos-slate">
                  — confiance {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
              <p className="mt-1 text-sm text-tenderos-navy">
                {formatSuggestionValue(suggestion.proposedValue)}
              </p>
              {suggestion.sourceChunkReference ? (
                <p className="mt-1 text-xs italic text-tenderos-slate">
                  &laquo;&nbsp;{suggestion.sourceChunkReference}&nbsp;&raquo;
                </p>
              ) : null}

              {canManage ? (
                conflictIds.has(suggestion.id) ? (
                  <div className="mt-2 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs text-warning-fg">
                      Cette cible porte déjà une valeur — choisissez comment traiter cette
                      suggestion.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CONFLICT_CHOICES.map((choice) => (
                        <Button
                          key={choice.value}
                          type="button"
                          disabled={isPending}
                          onClick={() => handleApply(suggestion, choice.value)}
                          variant="ghost"
                          size="sm"
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApply(suggestion)}
                      variant="secondary"
                      size="sm"
                    >
                      Appliquer
                    </Button>
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleReject(suggestion)}
                      variant="secondary"
                      size="sm"
                    >
                      Rejeter
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
