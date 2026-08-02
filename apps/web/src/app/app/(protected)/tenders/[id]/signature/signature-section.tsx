"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmSignatureRequirementAction,
  detectSignatureRequirementAction,
  importSignedDocumentAction,
  prepareSignatureTransactionAction,
  registerSignatoryAction,
  rejectSignatureRequirementAction,
  retrieveSignedArtifactsAction,
  startSignatureTransactionAction,
  syncSignatureTransactionAction,
  verifySignatoryAction,
  verifySignedDocumentIntegrityAction,
} from "../../../../signature-actions";
import {
  SIGNATORY_STATUS_LABELS,
  SIGNATURE_REQUIREMENT_STATUS_LABELS,
  SIGNATURE_TRANSACTION_STATUS_LABELS,
  canApproveSignature,
  canManageSignature,
  signatureStatusBadgeClass,
  type SignatorySummary,
  type SignatureRequirementSummary,
  type SignatureTransactionSummary,
} from "../../../../../../lib/signature-types";
import type { ExportJobSummary } from "../../../../../../lib/export-types";

function RequirementsPanel({ tenderId, requirements, canManage, canApprove }: { tenderId: string; requirements: SignatureRequirementSummary[]; canManage: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [documentRef, setDocumentRef] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleDetect() {
    if (!documentRef.trim()) {
      setError("La référence du document est requise.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await detectSignatureRequirementAction(tenderId, { documentRef: documentRef.trim(), mandatory });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setDocumentRef("");
      setIsAdding(false);
      router.refresh();
    }
  }

  async function handleDecision(requirementId: string, approved: boolean) {
    setIsPending(true);
    setError(undefined);
    const result = approved ? await confirmSignatureRequirementAction(tenderId, requirementId) : await rejectSignatureRequirementAction(tenderId, requirementId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Exigences de signature</h2>
      {requirements.length === 0 ? <p className="text-sm text-neutral-600">Aucune exigence détectée.</p> : null}
      <div className="flex flex-col gap-2">
        {requirements.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded border border-neutral-100 p-2">
            <div>
              <span className="text-sm text-neutral-800">{r.documentRef}</span>
              {r.mandatory ? <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700">Obligatoire</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(r.status)}`}>{SIGNATURE_REQUIREMENT_STATUS_LABELS[r.status] ?? r.status}</span>
              {canApprove && r.status === "DETECTED" ? (
                <>
                  <button type="button" disabled={isPending} onClick={() => handleDecision(r.id, true)} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                    Confirmer
                  </button>
                  <button type="button" disabled={isPending} onClick={() => handleDecision(r.id, false)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">
                    Rejeter
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        !isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
            Ajouter une exigence
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <input value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="Référence du document (ex: Acte d'engagement)" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
              Obligatoire
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={isPending} onClick={handleDetect} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Ajouter
              </button>
              <button type="button" onClick={() => setIsAdding(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                Annuler
              </button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SignatoriesPanel({ tenderId, signatories, canManage, canApprove }: { tenderId: string; signatories: SignatorySummary[]; canManage: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleRegister() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Prénom, nom et email professionnel sont requis.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await registerSignatoryAction(tenderId, { firstName: firstName.trim(), lastName: lastName.trim(), professionalEmail: email.trim() });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setIsAdding(false);
      router.refresh();
    }
  }

  async function handleVerify(signatoryId: string, approved: boolean) {
    setIsPending(true);
    setError(undefined);
    const result = await verifySignatoryAction(tenderId, signatoryId, approved);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Signataires</h2>
      {signatories.length === 0 ? <p className="text-sm text-neutral-600">Aucun signataire affecté.</p> : null}
      <div className="flex flex-col gap-2">
        {signatories.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border border-neutral-100 p-2">
            <span className="text-sm text-neutral-800">
              {s.firstName} {s.lastName} — {s.professionalEmail}
            </span>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(s.status)}`}>{SIGNATORY_STATUS_LABELS[s.status] ?? s.status}</span>
              {canApprove && s.status === "PENDING" ? (
                <>
                  <button type="button" disabled={isPending} onClick={() => handleVerify(s.id, true)} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                    Vérifier le pouvoir
                  </button>
                  <button type="button" disabled={isPending} onClick={() => handleVerify(s.id, false)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">
                    Rejeter
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        !isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
            Affecter un signataire
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email professionnel" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="button" disabled={isPending} onClick={handleRegister} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Affecter
              </button>
              <button type="button" onClick={() => setIsAdding(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                Annuler
              </button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function TransactionRow({ tenderId, transaction }: { tenderId: string; transaction: SignatureTransactionSummary }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [returnUrl, setReturnUrl] = useState(typeof window !== "undefined" ? window.location.href : "");
  const [importFile, setImportFile] = useState<File | undefined>();

  async function run(action: () => Promise<{ error?: string }>) {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  const hasSignedDocument = transaction.artifacts.some((a) => a.kind === "SIGNED_DOCUMENT");

  async function handleImport() {
    if (!importFile) {
      setError("Sélectionnez un fichier PDF.");
      return;
    }
    const formData = new FormData();
    formData.set("file", importFile);
    setIsPending(true);
    setError(undefined);
    const result = await importSignedDocumentAction(tenderId, transaction.id, formData);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(transaction.status)}`}>{SIGNATURE_TRANSACTION_STATUS_LABELS[transaction.status] ?? transaction.status}</span>
        <span className="text-xs text-neutral-500">Prestataire : {transaction.provider}</span>
        {transaction.provider === "FAKE" ? <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Mode démonstration — aucune signature réelle</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {transaction.status === "PREPARING" ? (
          <>
            <input value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} placeholder="URL de retour (https://...)" className="min-w-[220px] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
            <button type="button" disabled={isPending} onClick={() => run(() => startSignatureTransactionAction(tenderId, transaction.id, returnUrl))} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Démarrer
            </button>
          </>
        ) : null}
        {transaction.status === "SENT" || transaction.status === "IN_PROGRESS" ? (
          <button type="button" disabled={isPending} onClick={() => run(() => syncSignatureTransactionAction(tenderId, transaction.id))} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
            Synchroniser (simulation locale)
          </button>
        ) : null}
        {transaction.status === "SIGNED" && !hasSignedDocument ? (
          <button type="button" disabled={isPending} onClick={() => run(() => retrieveSignedArtifactsAction(tenderId, transaction.id))} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
            Récupérer document et preuve
          </button>
        ) : null}
        {transaction.status === "SIGNED" && hasSignedDocument ? (
          <button type="button" disabled={isPending} onClick={() => run(() => verifySignedDocumentIntegrityAction(tenderId, transaction.id))} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
            Vérifier l&apos;intégrité
          </button>
        ) : null}
        {transaction.status === "VERIFIED" ? (
          <>
            <a href={`/app/tenders/${tenderId}/signature/${transaction.id}/signed-document`} className="text-sm font-medium text-neutral-900 hover:underline">
              Télécharger le document signé
            </a>
            <a href={`/app/tenders/${tenderId}/signature/${transaction.id}/evidence`} className="text-sm font-medium text-neutral-900 hover:underline">
              Télécharger la preuve
            </a>
          </>
        ) : null}
      </div>

      {transaction.status === "SENT" || transaction.status === "IN_PROGRESS" || transaction.status === "SIGNED" ? (
        <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
          <span className="text-xs text-neutral-500">Ou importer manuellement un document déjà signé :</span>
          <input type="file" accept="application/pdf" onChange={(e) => setImportFile(e.target.files?.[0])} className="text-xs" />
          <button type="button" disabled={isPending} onClick={handleImport} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50">
            Importer
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TransactionsPanel({
  tenderId,
  transactions,
  signatories,
  finalExports,
  canApprove,
}: {
  tenderId: string;
  transactions: SignatureTransactionSummary[];
  signatories: SignatorySummary[];
  finalExports: ExportJobSummary[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const verifiedSignatories = signatories.filter((s) => s.status === "VERIFIED");
  const [exportJobId, setExportJobId] = useState(finalExports[0]?.id ?? "");
  const [selectedSignatoryIds, setSelectedSignatoryIds] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function toggleSignatory(id: string) {
    setSelectedSignatoryIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function handlePrepare() {
    if (!exportJobId || selectedSignatoryIds.length === 0) {
      setError("Sélectionnez un export final et au moins un signataire vérifié.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await prepareSignatureTransactionAction(tenderId, exportJobId, selectedSignatoryIds);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setSelectedSignatoryIds([]);
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Transactions de signature</h2>

      {transactions.length === 0 ? <p className="text-sm text-neutral-600">Aucune transaction préparée.</p> : null}
      <div className="flex flex-col gap-2">
        {transactions.map((t) => (
          <TransactionRow key={t.id} tenderId={tenderId} transaction={t} />
        ))}
      </div>

      {canApprove ? (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-neutral-50 p-3">
          <h3 className="text-sm font-medium text-neutral-900">Préparer une nouvelle transaction</h3>
          {finalExports.length === 0 ? (
            <p className="text-sm text-amber-700">Aucun export FINAL disponible — une approbation dans l&apos;onglet Validation est requise au préalable.</p>
          ) : verifiedSignatories.length === 0 ? (
            <p className="text-sm text-amber-700">Aucun signataire au pouvoir vérifié — vérifiez un signataire ci-dessus au préalable.</p>
          ) : (
            <>
              <select value={exportJobId} onChange={(e) => setExportJobId(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm">
                {finalExports.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.documentType} v{job.version}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1">
                {verifiedSignatories.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input type="checkbox" checked={selectedSignatoryIds.includes(s.id)} onChange={() => toggleSignatory(s.id)} />
                    {s.firstName} {s.lastName}
                  </label>
                ))}
              </div>
              <button type="button" disabled={isPending} onClick={handlePrepare} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {isPending ? "Préparation..." : "Préparer la transaction"}
              </button>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SignatureSection({
  tenderId,
  initialRequirements,
  initialSignatories,
  initialTransactions,
  finalExports,
  actorRole,
}: {
  tenderId: string;
  initialRequirements: SignatureRequirementSummary[];
  initialSignatories: SignatorySummary[];
  initialTransactions: SignatureTransactionSummary[];
  finalExports: ExportJobSummary[];
  actorRole: string | undefined;
}) {
  const canManage = canManageSignature(actorRole);
  const canApprove = canApproveSignature(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <RequirementsPanel tenderId={tenderId} requirements={initialRequirements} canManage={canManage} canApprove={canApprove} />
      <SignatoriesPanel tenderId={tenderId} signatories={initialSignatories} canManage={canManage} canApprove={canApprove} />
      <TransactionsPanel tenderId={tenderId} transactions={initialTransactions} signatories={initialSignatories} finalExports={finalExports} canApprove={canApprove} />
    </div>
  );
}
