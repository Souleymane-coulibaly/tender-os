"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorProfileAction, restoreSubcontractorProfileAction } from "../../../subcontractor-actions";
import type { SubcontractorProfileStatus } from "../../../../../lib/subcontractor-types";
import { Button } from "../../../../../components/ui";

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
        <Button type="button" onClick={handleRestore} disabled={isPending}>
          {isPending ? "..." : "Restaurer"}
        </Button>
      ) : (
        <Button type="button" variant="danger" onClick={handleArchive} disabled={isPending}>
          {isPending ? "..." : "Archiver"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
