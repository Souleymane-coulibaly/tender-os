"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runSavedSearchNowAction } from "../../market-watch-actions";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E10, mission §13.B-§13.D "Tester la veille" — le frontend n'exécute
 * JAMAIS lui-même le matching (mission §13.C, dernier paragraphe) : il appelle uniquement
 * `runSavedSearchNowAction`, qui appelle le VRAI use case backend, et affiche EXACTEMENT le nombre
 * qu'il retourne — jamais un résultat fabriqué côté client.
 */
export function RunSavedSearchNowButton({ savedSearchId }: { savedSearchId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | undefined>();

  async function handleClick() {
    setIsPending(true);
    setFeedback(undefined);
    const result = await runSavedSearchNowAction(savedSearchId);
    setIsPending(false);
    if (result.error) {
      setFeedback({ kind: "error", message: "Impossible d'exécuter la veille pour le moment." });
      return;
    }
    const count = result.matchesFound ?? 0;
    setFeedback({
      kind: "success",
      message: count > 0 ? `Veille testée — ${count} nouvelle${count > 1 ? "s" : ""} opportunité${count > 1 ? "s" : ""} trouvée${count > 1 ? "s" : ""}.` : "Veille testée — aucune nouvelle opportunité trouvée.",
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
      >
        {isPending ? "Recherche en cours..." : "Tester la veille"}
      </button>
      {feedback ? <p className={`text-sm ${feedback.kind === "error" ? "text-red-600" : "text-neutral-600"}`}>{feedback.message}</p> : null}
    </div>
  );
}
