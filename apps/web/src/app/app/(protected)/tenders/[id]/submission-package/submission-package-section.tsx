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
import { Button } from "../../../../../../components/ui/button";
import { Alert } from "../../../../../../components/ui/alert";

export function SubmissionPackageSection({
  tenderId,
  initialPackages,
  actorRole,
}: {
  tenderId: string;
  initialPackages: SubmissionPackageSummary[];
  actorRole: string | undefined;
}) {
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
        <section data-tour="guide-tender-submission-package-create" className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
          <h2 className="text-sm font-semibold text-tenderos-navy">
            Constituer un nouveau package
          </h2>
          <p className="text-sm text-tenderos-slate">
            Un nouveau package produit toujours une nouvelle version — jamais une mise à jour du
            package précédent. Nécessite une approbation finale active ; si des exigences de
            signature obligatoires sont confirmées, toutes les transactions doivent être vérifiées.
          </p>
          <Button
            type="button"
            disabled={isPending}
            onClick={handleCreate}
            className="self-start"
            variant="primary"
            size="sm"
          >
            {isPending ? "Constitution en cours..." : "Constituer le package"}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {latest?.status === "COMPLETED" ? (
        <div data-tour="guide-tender-submission-package-ready">
          <Alert tone="success">
            <p className="text-sm font-medium text-success-fg">
              Package v{latest.version} prêt —{" "}
              {PACKAGE_STATUS_LABELS[latest.readinessStatus] ?? latest.readinessStatus}
            </p>
          </Alert>
        </div>
      ) : null}

      <section data-tour="guide-tender-submission-package-history" className="rounded border border-tenderos-navy/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-tenderos-navy">Historique des packages</h2>
        {initialPackages.length === 0 ? (
          <p className="text-sm text-tenderos-slate">
            Aucun package constitué pour l&apos;instant.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {initialPackages.map((pkg) => (
              <div key={pkg.id} data-tour="guide-tender-submission-package-version" className="rounded border border-tenderos-navy/10 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-tenderos-navy">
                    Version {pkg.version}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${packageStatusBadgeClass(pkg.status)}`}
                  >
                    {PACKAGE_STATUS_LABELS[pkg.status] ?? pkg.status}
                  </span>
                  <span className="text-xs text-tenderos-slate">
                    {new Date(pkg.createdAt).toLocaleString("fr-FR")}
                  </span>
                  {pkg.status === "COMPLETED" ? (
                    <a
                      href={`/app/tenders/${tenderId}/submission-package/${pkg.id}/download`}
                      className="ml-auto text-sm font-medium text-tenderos-navy hover:underline"
                    >
                      Télécharger le ZIP
                    </a>
                  ) : null}
                </div>
                {pkg.errorMessage ? (
                  <p className="mb-2 text-xs text-danger-fg">{pkg.errorMessage}</p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {pkg.files.map((file) => (
                    <li
                      key={file.archivePath}
                      className="flex items-center justify-between text-xs text-tenderos-slate"
                    >
                      <span>{file.archivePath}</span>
                      <span className="text-tenderos-slate">
                        {PACKAGE_FILE_SOURCE_LABELS[file.sourceType] ?? file.sourceType}
                      </span>
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
