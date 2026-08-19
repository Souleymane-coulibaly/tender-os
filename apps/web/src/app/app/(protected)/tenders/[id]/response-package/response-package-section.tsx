"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildResponsePackageVersionAction,
  correctPackageItemQualificationAction,
  createResponsePackageAction,
  fetchPackageCompleteness,
  fetchResponsePackage,
  fetchResponsePackageFreshness,
  generateResponsePackageZipAction,
  validateResponsePackageVersionAction,
} from "../../../../response-package-actions";
import { approveApprovalAction, fetchApprovals, rejectApprovalAction, requestApprovalAction } from "../../../../workspace-actions";
import { APPROVAL_STATUS_LABELS, type ApprovalRequest, type TenderParticipant } from "../../../../../../lib/workspace-types";
import {
  APPLICABILITY_LABELS,
  CATEGORY_LABELS,
  RESPONSE_PACKAGE_FRESHNESS_LABELS,
  RESPONSE_PACKAGE_STATUS_LABELS,
  REQUIREMENT_TYPE_LABELS,
  packageItemStatusBadge,
  responsePackageFreshnessBadgeClass,
  responsePackageStatusBadgeClass,
  type PackageCompleteness,
  type PackageItem,
  type PackageItemApplicabilityStatus,
  type PackageItemRequirementType,
  type ResponsePackage,
  type ResponsePackageFreshnessResult,
  type ResponsePackageVersion,
} from "../../../../../../lib/response-package-types";

type DetailState = {
  responsePackage: ResponsePackage;
  versions: ResponsePackageVersion[];
  items: PackageItem[];
  completeness: PackageCompleteness | undefined;
};

function CreatePackageForm({ tenderId, lots, onCreated }: { tenderId: string; lots: { id: string; lotNumber: string; title: string }[]; onCreated: (pkg: ResponsePackage) => void }) {
  const [lotId, setLotId] = useState<string>("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const result = await createResponsePackageAction(tenderId, lotId || undefined);
    setIsPending(false);
    if (result.error || !result.responsePackage) {
      setError(result.error ?? "La création du dossier a échoué.");
      return;
    }
    onCreated(result.responsePackage);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="lot-select" className="text-xs font-medium text-neutral-600">
          Lot
        </label>
        <select id="lot-select" value={lotId} onChange={(event) => setLotId(event.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="">Tous lots (dossier global)</option>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              Lot {lot.lotNumber} — {lot.title}
            </option>
          ))}
        </select>
      </div>
      <button type="button" onClick={handleCreate} disabled={isPending} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création…" : "Créer le dossier de réponse"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function CompletenessSummary({ completeness }: { completeness: PackageCompleteness | undefined }) {
  if (!completeness) return null;
  const ratioLabel = completeness.requiredCompletenessRatio === undefined ? "—" : `${Math.round(completeness.requiredCompletenessRatio * 100)}%`;
  return (
    <div className="rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold">Complétude — {ratioLabel}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded bg-neutral-50 p-2">
          <div className="font-medium">Obligatoires</div>
          <div>
            {completeness.requiredAvailable} / {completeness.requiredApplicableTotal}
          </div>
        </div>
        <div className="rounded bg-neutral-50 p-2">
          <div className="font-medium">Facultatifs</div>
          <div>
            {completeness.optionalAvailable} / {completeness.optionalApplicableTotal}
          </div>
        </div>
        <div className="rounded bg-neutral-50 p-2">
          <div className="font-medium">Non applicables</div>
          <div>{completeness.notApplicableTotal}</div>
        </div>
        <div className="rounded bg-neutral-50 p-2">
          <div className="font-medium">À vérifier</div>
          <div>{completeness.needsReviewTotal}</div>
        </div>
      </div>
      {!completeness.ready && completeness.requiredMissingLabels.length > 0 ? (
        <p className="mt-2 text-xs text-red-700">Manquant(s) : {completeness.requiredMissingLabels.join(", ")}</p>
      ) : null}
    </div>
  );
}

function ItemRow({ tenderId, responsePackageId, item, editable, onUpdated }: { tenderId: string; responsePackageId: string; item: PackageItem; editable: boolean; onUpdated: () => void }) {
  const [requirementType, setRequirementType] = useState<PackageItemRequirementType>(item.requirementType);
  const [applicabilityStatus, setApplicabilityStatus] = useState<PackageItemApplicabilityStatus>(item.applicabilityStatus);
  const [isPending, setIsPending] = useState(false);
  const badge = packageItemStatusBadge(item.status);

  async function handleSave(): Promise<void> {
    setIsPending(true);
    await correctPackageItemQualificationAction(tenderId, responsePackageId, item.id, { requirementType, applicabilityStatus });
    setIsPending(false);
    onUpdated();
  }

  const changed = requirementType !== item.requirementType || applicabilityStatus !== item.applicabilityStatus;

  return (
    <tr className="border-t border-neutral-100">
      <td className="px-3 py-2 text-xs text-neutral-500">{CATEGORY_LABELS[item.category]}</td>
      <td className="px-3 py-2 text-sm">{item.label}</td>
      <td className="px-3 py-2">
        {editable ? (
          <select value={requirementType} onChange={(event) => setRequirementType(event.target.value as PackageItemRequirementType)} className="rounded border border-neutral-300 px-1.5 py-1 text-xs">
            {Object.entries(REQUIREMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs">{REQUIREMENT_TYPE_LABELS[item.requirementType]}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <select value={applicabilityStatus} onChange={(event) => setApplicabilityStatus(event.target.value as PackageItemApplicabilityStatus)} className="rounded border border-neutral-300 px-1.5 py-1 text-xs">
            {Object.entries(APPLICABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs">{APPLICABILITY_LABELS[item.applicabilityStatus]}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
      </td>
      <td className="px-3 py-2">
        {editable && changed ? (
          <button type="button" onClick={handleSave} disabled={isPending} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            {isPending ? "…" : "Enregistrer"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

/** V2 Sprint 18 (mission §43-50) — validation FINALE avant dépôt : une ApprovalRequest interne
 *  distincte du verrou d'immuabilité déjà porté par `handleValidate` ci-dessous. Jamais présentée
 *  comme une signature électronique (mission §47, "validation interne TenderOS", la signature est
 *  reportée à un futur sprint). N'apparaît qu'une fois la version VALIDATED (mission §46,
 *  prérequis déjà revérifié côté API — `APPROVAL_TARGET_NOT_IMMUTABLE` sinon). */
function FinalApprovalPanel({
  tenderId,
  versionId,
  participants,
  members,
  actorId,
  actorRole,
}: {
  tenderId: string;
  versionId: string;
  participants: TenderParticipant[];
  members: { userId: string; email: string; displayName: string }[];
  actorId: string | undefined;
  actorRole: string | undefined;
}) {
  const [approval, setApproval] = useState<ApprovalRequest | undefined | null>(undefined);
  const [reviewerId, setReviewerId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function refresh(): Promise<void> {
    const all = await fetchApprovals(tenderId);
    const forThisVersion = all.filter((a) => a.entityType === "RESPONSE_PACKAGE_VERSION" && a.entityId === versionId);
    // La plus récente prévaut (mission §39 "stale approval" — une V antérieure ne doit jamais
    // masquer la demande active de CETTE version précise, mais une version ne porte jamais deux
    // demandes actives simultanées côté backend).
    setApproval(forThisVersion.length > 0 ? forThisVersion[forThisVersion.length - 1] : null);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  if (approval === undefined) {
    return null;
  }

  const canValidateResponsePackage = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"].includes(actorRole ?? "");

  return (
    <div className="flex flex-col gap-2 rounded border border-blue-200 bg-blue-50 p-3">
      <h4 className="text-xs font-semibold text-blue-900">Validation finale avant dépôt</h4>
      <p className="text-xs text-blue-800">Validation interne TenderOS — ce n&apos;est pas une signature électronique.</p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {!approval ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsPending(true);
            setError(undefined);
            const result = await requestApprovalAction(tenderId, { entityType: "RESPONSE_PACKAGE_VERSION", entityId: versionId, reviewerId });
            setIsPending(false);
            if (result.error) setError(result.error);
            else await refresh();
          }}
        >
          <select aria-label="Approbateur final" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} required className="rounded border border-blue-300 px-2 py-1 text-xs">
            <option value="">Choisir l&apos;approbateur…</option>
            {participants.map((p) => (
              <option key={p.userId} value={p.userId}>
                {members.find((m) => m.userId === p.userId)?.displayName ?? p.userId}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isPending || !reviewerId} className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
            Demander la validation finale
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={`self-start rounded px-2 py-0.5 text-xs ${approval.status === "APPROVED" ? "bg-green-100 text-green-800" : approval.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
            {APPROVAL_STATUS_LABELS[approval.status]}
          </span>
          {approval.comment ? <p className="text-xs italic text-blue-800">{approval.comment}</p> : null}
          {approval.status === "PENDING" && canValidateResponsePackage && approval.reviewerId === actorId ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await approveApprovalAction(tenderId, approval.id);
                  setIsPending(false);
                  if (result.error) setError(result.error);
                  else await refresh();
                }}
                className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                Approuver
              </button>
              {showReject ? (
                <>
                  <input
                    aria-label="Raison du rejet"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Raison (obligatoire)"
                    className="rounded border border-red-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={isPending || rejectReason.trim().length === 0}
                    onClick={async () => {
                      setIsPending(true);
                      const result = await rejectApprovalAction(tenderId, approval.id, rejectReason);
                      setIsPending(false);
                      if (result.error) setError(result.error);
                      else {
                        setShowReject(false);
                        setRejectReason("");
                        await refresh();
                      }
                    }}
                    className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    Confirmer le rejet
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setShowReject(true)} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100">
                  Rejeter
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PackageDetail({
  tenderId,
  detail,
  onRefresh,
  participants,
  members,
  actorId,
  actorRole,
}: {
  tenderId: string;
  detail: DetailState;
  onRefresh: () => Promise<void>;
  participants: TenderParticipant[];
  members: { userId: string; email: string; displayName: string }[];
  actorId: string | undefined;
  actorRole: string | undefined;
}) {
  const { responsePackage, versions, items, completeness } = detail;
  const currentVersion = versions.find((v) => v.id === responsePackage.currentVersionId);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  // Checkpoint 2.1-P2.1-FIX-E — lecture seule, jamais bloquant : dégradé à `null` (bandeau
  // simplement absent) sur toute erreur inattendue.
  const [freshness, setFreshness] = useState<ResponsePackageFreshnessResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchResponsePackageFreshness(responsePackage.id).then((result) => {
      if (!cancelled) setFreshness(result);
    });
    return () => {
      cancelled = true;
    };
  }, [responsePackage.id, responsePackage.currentVersionId]);

  const isValidated = currentVersion?.status === "VALIDATED";

  async function handleBuild(): Promise<void> {
    setIsBuilding(true);
    setActionError(undefined);
    const result = await buildResponsePackageVersionAction(tenderId, responsePackage.id);
    setIsBuilding(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await onRefresh();
  }

  async function handleValidate(): Promise<void> {
    if (!currentVersion) return;
    setIsValidating(true);
    setActionError(undefined);
    const result = await validateResponsePackageVersionAction(tenderId, responsePackage.id, currentVersion.id);
    setIsValidating(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await onRefresh();
  }

  async function handleGenerate(): Promise<void> {
    if (!currentVersion) return;
    setIsGenerating(true);
    setActionError(undefined);
    const result = await generateResponsePackageZipAction(tenderId, responsePackage.id, currentVersion.id);
    setIsGenerating(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await onRefresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Dossier de réponse</h3>
          <p className="text-xs text-neutral-500">{currentVersion ? `Version ${currentVersion.versionNumber}` : "Aucune version construite pour l'instant"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs ${responsePackageStatusBadgeClass(responsePackage.status)}`}>{RESPONSE_PACKAGE_STATUS_LABELS[responsePackage.status]}</span>
          {freshness && freshness.currentVersionId ? (
            <span
              className={`rounded px-2 py-1 text-xs ${responsePackageFreshnessBadgeClass(freshness.freshness)}`}
              title="Fraîcheur de la version courante par rapport aux pièces réellement attendues aujourd'hui"
            >
              {RESPONSE_PACKAGE_FRESHNESS_LABELS[freshness.freshness]}
            </span>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">
          {actionError}
        </p>
      ) : null}

      <button type="button" onClick={handleBuild} disabled={isBuilding} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isBuilding ? "Construction…" : currentVersion ? "Reconstruire une nouvelle version" : "Construire le dossier depuis la Checklist"}
      </button>

      {currentVersion ? (
        <>
          <CompletenessSummary completeness={completeness} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-xs font-medium text-neutral-500">
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Pièce</th>
                  <th className="px-3 py-2">Obligation</th>
                  <th className="px-3 py-2">Applicabilité</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ItemRow key={item.id} tenderId={tenderId} responsePackageId={responsePackage.id} item={item} editable={!isValidated} onUpdated={() => void onRefresh()} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
            {!isValidated ? (
              <button type="button" onClick={handleValidate} disabled={isValidating} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {isValidating ? "Validation…" : "Valider le dossier"}
              </button>
            ) : (
              <>
                <span className="text-xs text-green-700">Version validée — immuable.</span>
                <button type="button" onClick={handleGenerate} disabled={isGenerating} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {isGenerating ? "Génération…" : "Générer le package final"}
                </button>
                {responsePackage.status === "EXPORTED" ? (
                  <Link href={`/app/response-packages/${responsePackage.id}/versions/${currentVersion.id}/download`} className="text-sm font-medium text-blue-700 underline">
                    Télécharger le ZIP
                  </Link>
                ) : null}
              </>
            )}
          </div>

          {isValidated ? <FinalApprovalPanel tenderId={tenderId} versionId={currentVersion.id} participants={participants} members={members} actorId={actorId} actorRole={actorRole} /> : null}
        </>
      ) : null}

      {versions.length > 0 ? (
        <div className="border-t border-neutral-100 pt-3">
          <h4 className="text-xs font-semibold text-neutral-600">Historique des versions</h4>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-neutral-500">
            {versions.map((v) => (
              <li key={v.id}>
                V{v.versionNumber} — {v.status} {v.validatedAt ? `— validée le ${new Date(v.validatedAt).toLocaleDateString("fr-FR")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ResponsePackageSection({
  tenderId,
  initialPackages,
  lots,
  participants,
  members,
  actorRole,
  actorId,
}: {
  tenderId: string;
  initialPackages: ResponsePackage[];
  lots: { id: string; lotNumber: string; title: string }[];
  participants: TenderParticipant[];
  members: { userId: string; email: string; displayName: string }[];
  actorRole: string | undefined;
  actorId: string | undefined;
}) {
  const [packages, setPackages] = useState(initialPackages);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialPackages[0]?.id);
  const [detail, setDetail] = useState<DetailState | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  async function loadDetail(responsePackageId: string): Promise<void> {
    setIsLoading(true);
    setSelectedId(responsePackageId);
    const result = await fetchResponsePackage(responsePackageId);
    const currentVersion = result.versions.find((v) => v.id === result.responsePackage.currentVersionId);
    if (currentVersion) {
      const [full, completeness] = await Promise.all([fetchResponsePackage(responsePackageId, currentVersion.id), fetchPackageCompleteness(responsePackageId, currentVersion.id).catch(() => undefined)]);
      setDetail({ responsePackage: result.responsePackage, versions: result.versions, items: full.items, completeness });
    } else {
      setDetail({ responsePackage: result.responsePackage, versions: result.versions, items: [], completeness: undefined });
    }
    setIsLoading(false);
  }

  function handleCreated(pkg: ResponsePackage): void {
    setPackages((prev) => [pkg, ...prev]);
    void loadDetail(pkg.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <CreatePackageForm tenderId={tenderId} lots={lots} onCreated={handleCreated} />

      {packages.length === 0 ? (
        <p className="rounded border border-neutral-200 p-4 text-sm text-neutral-500">Aucun dossier de réponse pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex w-full flex-col gap-2 lg:w-64">
            <h2 className="text-sm font-semibold">Dossiers</h2>
            {packages.map((pkg) => {
              const lot = lots.find((l) => l.id === pkg.lotId);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => void loadDetail(pkg.id)}
                  className={`rounded border p-3 text-left text-sm ${selectedId === pkg.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                >
                  <div className="font-medium">{lot ? `Lot ${lot.lotNumber}` : "Tous lots"}</div>
                  <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${responsePackageStatusBadgeClass(pkg.status)}`}>{RESPONSE_PACKAGE_STATUS_LABELS[pkg.status]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1">
            {isLoading ? (
              <p className="text-sm text-neutral-500">Chargement…</p>
            ) : detail && detail.responsePackage.id === selectedId ? (
              <PackageDetail tenderId={tenderId} detail={detail} onRefresh={() => loadDetail(detail.responsePackage.id)} participants={participants} members={members} actorId={actorId} actorRole={actorRole} />
            ) : (
              <p className="text-sm text-neutral-500">Sélectionnez un dossier pour afficher son détail.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
