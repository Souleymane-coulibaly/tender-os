"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveModelRecommendationAction, rejectModelRecommendationAction } from "../../../ai-configuration-actions";

export function RecommendationDecisionButtons({ recommendationId }: { recommendationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | undefined>();

  async function handleDecision(decision: "approve" | "reject") {
    setPendingAction(decision);
    const result =
      decision === "approve"
        ? await approveModelRecommendationAction(recommendationId)
        : await rejectModelRecommendationAction(recommendationId);
    setPendingAction(undefined);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleDecision("approve")}
          disabled={pendingAction !== undefined}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pendingAction === "approve" ? "Approbation..." : "Approuver"}
        </button>
        <button
          type="button"
          onClick={() => handleDecision("reject")}
          disabled={pendingAction !== undefined}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {pendingAction === "reject" ? "Rejet..." : "Rejeter"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
