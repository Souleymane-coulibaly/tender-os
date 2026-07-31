"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activateRoutingPolicyAction, archiveRoutingPolicyAction } from "../../../../ai-configuration-actions";

export function RoutingPolicyLifecycleButtons({ policyId, status }: { policyId: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED" }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleActivate() {
    setIsPending(true);
    const result = await activateRoutingPolicyAction(policyId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleArchive() {
    setIsPending(true);
    const result = await archiveRoutingPolicyAction(policyId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "DRAFT" ? (
          <button
            type="button"
            onClick={handleActivate}
            disabled={isPending}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Activation..." : "Activer"}
          </button>
        ) : null}
        {status === "ACTIVE" ? (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {isPending ? "Archivage..." : "Archiver"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
