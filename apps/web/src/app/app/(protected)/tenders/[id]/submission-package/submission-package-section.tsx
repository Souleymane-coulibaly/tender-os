"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSubmissionPackageAction } from "../../../../submission-package-actions";
import {
  PACKAGE_FILE_SOURCE_LABELS,
  PACKAGE_STATUS_LABELS,
  canCreateSubmissionPackage,
  packageStatusBadgeClass,
  type SubmissionPackageSummary,
} from "../../../../../../lib/submission-package-types";

export function SubmissionPackageSection({ tenderId, initialPackages, actorRole }: { tenderId: string; initialPackages: SubmissionPackageSummary[]; actorRole: string | undefined }) {
  const router = useRouter();
  const canCreate = canCreateSubmissionPackage(actorRole);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const latest = initialPackages[0];

  async function handleCreate() {
    setIsPending(true);
    setError(undefined);
    const result = await createSubmissionPackageAction(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {canCreate ? (
        <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Constituer un nouveau package</h2>
          <p className="text-sm text-neutral-600">
            Un nouveau package produit toujours une nouvelle version — jamais une mise à jour du package précédent. Nécessite une approbation finale active ; si des exigences de signature
            obligatoires sont confirmées, toutes les transactions doivent être vérifiées.
          </p>
          <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {isPending ? "Constitution en cours..." : "Constituer le package"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {latest?.status === "COMPLETED" ? (
        <section className="rounded border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">Package v{latest.version} prêt — {PACKAGE_STATUS_LABELS[latest.readinessStatus] ?? latest.readinessStatus}</p>
        </section>
      ) : null}

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Historique des packages</h2>
        {initialPackages.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun package constitué pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {initialPackages.map((pkg) => (
              <div key={pkg.id} className="rounded border border-neutral-100 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">Version {pkg.version}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${packageStatusBadgeClass(pkg.status)}`}>{PACKAGE_STATUS_LABELS[pkg.status] ?? pkg.status}</span>
                  <span className="text-xs text-neutral-500">{new Date(pkg.createdAt).toLocaleString("fr-FR")}</span>
                  {pkg.status === "COMPLETED" ? (
                    <a href={`/app/tenders/${tenderId}/submission-package/${pkg.id}/download`} className="ml-auto text-sm font-medium text-neutral-900 hover:underline">
                      Télécharger le ZIP
                    </a>
                  ) : null}
                </div>
                {pkg.errorMessage ? <p className="mb-2 text-xs text-red-700">{pkg.errorMessage}</p> : null}
                <ul className="flex flex-col gap-1">
                  {pkg.files.map((file) => (
                    <li key={file.archivePath} className="flex items-center justify-between text-xs text-neutral-600">
                      <span>{file.archivePath}</span>
                      <span className="text-neutral-400">{PACKAGE_FILE_SOURCE_LABELS[file.sourceType] ?? file.sourceType}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
