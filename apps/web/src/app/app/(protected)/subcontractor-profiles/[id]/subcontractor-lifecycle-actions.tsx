"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorProfileAction, restoreSubcontractorProfileAction } from "../../../subcontractor-actions";
import type { SubcontractorProfileStatus } from "../../../../../lib/subcontractor-types";

export function SubcontractorLifecycleActions({ subcontractorId, status }: { subcontractorId: string; status: SubcontractorProfileStatus }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleArchive() {
    setIsPending(true);
    const result = await archiveSubcontractorProfileAction(subcontractorId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleRestore() {
    setIsPending(true);
    const result = await restoreSubcontractorProfileAction(subcontractorId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "ARCHIVED" ? (
        <button type="button" onClick={handleRestore} disabled={isPending} className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50">
          {isPending ? "..." : "Restaurer"}
        </button>
      ) : (
        <button type="button" onClick={handleArchive} disabled={isPending} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
          {isPending ? "..." : "Archiver"}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
