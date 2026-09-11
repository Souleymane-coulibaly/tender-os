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
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";
import { FileInput } from "../../../../../../components/ui/file-input";

function RequirementsPanel({
  tenderId,
  requirements,
  canManage,
  canApprove,
}: {
  tenderId: string;
  requirements: SignatureRequirementSummary[];
  canManage: boolean;
  canApprove: boolean;
}) {
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
    const result = await detectSignatureRequirementAction(tenderId, {
      documentRef: documentRef.trim(),
      mandatory,
    });
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
    const result = approved
      ? await confirmSignatureRequirementAction(tenderId, requirementId)
      : await rejectSignatureRequirementAction(tenderId, requirementId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
      <h2 className="text-sm font-semibold text-tenderos-navy">Exigences de signature</h2>
      {requirements.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune exigence détectée.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {requirements.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded border border-tenderos-navy/10 p-2"
          >
            <div>
              <span className="text-sm text-tenderos-navy">{r.documentRef}</span>
              {r.mandatory ? (
                <span className="ml-2 rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
                  Obligatoire
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(r.status)}`}
              >
                {SIGNATURE_REQUIREMENT_STATUS_LABELS[r.status] ?? r.status}
              </span>
              {canApprove && r.status === "DETECTED" ? (
                <>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDecision(r.id, true)}
                    variant="secondary"
                    size="sm"
                  >
                    Confirmer
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDecision(r.id, false)}
                    variant="danger"
                    size="sm"
                  >
                    Rejeter
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        !isAdding ? (
          <Button
            type="button"
            onClick={() => setIsAdding(true)}
            className="self-start"
            variant="secondary"
            size="sm"
          >
            Ajouter une exigence
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
            <Input
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
              placeholder="Référence du document (ex: Acte d'engagement)"
            />
            <label className="flex items-center gap-2 text-sm text-tenderos-navy">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(e) => setMandatory(e.target.checked)}
              />
              Obligatoire
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={isPending}
                onClick={handleDetect}
                variant="primary"
                size="sm"
              >
                Ajouter
              </Button>
              <Button
                type="button"
                onClick={() => setIsAdding(false)}
                variant="secondary"
                size="sm"
              >
                Annuler
              </Button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SignatoriesPanel({
  tenderId,
  signatories,
  canManage,
  canApprove,
}: {
  tenderId: string;
  signatories: SignatorySummary[];
  canManage: boolean;
  canApprove: boolean;
}) {
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
    const result = await registerSignatoryAction(tenderId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      professionalEmail: email.trim(),
    });
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
    <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
      <h2 className="text-sm font-semibold text-tenderos-navy">Signataires</h2>
      {signatories.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucun signataire affecté.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {signatories.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded border border-tenderos-navy/10 p-2"
          >
            <span className="text-sm text-tenderos-navy">
              {s.firstName} {s.lastName} — {s.professionalEmail}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(s.status)}`}
              >
                {SIGNATORY_STATUS_LABELS[s.status] ?? s.status}
              </span>
              {canApprove && s.status === "PENDING" ? (
                <>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVerify(s.id, true)}
                    variant="secondary"
                    size="sm"
                  >
                    Vérifier le pouvoir
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVerify(s.id, false)}
                    variant="danger"
                    size="sm"
                  >
                    Rejeter
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        !isAdding ? (
          <Button
            type="button"
            onClick={() => setIsAdding(true)}
            className="self-start"
            variant="secondary"
            size="sm"
          >
            Affecter un signataire
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prénom"
            />
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
            />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email professionnel"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={isPending}
                onClick={handleRegister}
                variant="primary"
                size="sm"
              >
                Affecter
              </Button>
              <Button
                type="button"
                onClick={() => setIsAdding(false)}
                variant="secondary"
                size="sm"
              >
                Annuler
              </Button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function TransactionRow({
  tenderId,
  transaction,
}: {
  tenderId: string;
  transaction: SignatureTransactionSummary;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [returnUrl, setReturnUrl] = useState(
    typeof window !== "undefined" ? window.location.href : "",
  );
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
    <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${signatureStatusBadgeClass(transaction.status)}`}
        >
          {SIGNATURE_TRANSACTION_STATUS_LABELS[transaction.status] ?? transaction.status}
        </span>
        <span className="text-xs text-tenderos-slate">Prestataire : {transaction.provider}</span>
        {transaction.provider === "FAKE" ? (
          <span className="rounded bg-info-bg px-2 py-0.5 text-xs font-medium text-info-fg">
            Mode démonstration — aucune signature réelle
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {transaction.status === "PREPARING" ? (
          <>
            <Input
              value={returnUrl}
              onChange={(e) => setReturnUrl(e.target.value)}
              placeholder="URL de retour (https://...)"
              className="min-w-[220px] flex-1"
            />
            <Button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => startSignatureTransactionAction(tenderId, transaction.id, returnUrl))
              }
              variant="primary"
              size="sm"
            >
              Démarrer
            </Button>
          </>
        ) : null}
        {transaction.status === "SENT" || transaction.status === "IN_PROGRESS" ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => syncSignatureTransactionAction(tenderId, transaction.id))}
            variant="secondary"
            size="sm"
          >
            Synchroniser (simulation locale)
          </Button>
        ) : null}
        {transaction.status === "SIGNED" && !hasSignedDocument ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => retrieveSignedArtifactsAction(tenderId, transaction.id))}
            variant="secondary"
            size="sm"
          >
            Récupérer document et preuve
          </Button>
        ) : null}
        {transaction.status === "SIGNED" && hasSignedDocument ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => verifySignedDocumentIntegrityAction(tenderId, transaction.id))}
            variant="secondary"
            size="sm"
          >
            Vérifier l&apos;intégrité
          </Button>
        ) : null}
        {transaction.status === "VERIFIED" ? (
          <>
            <a
              href={`/app/tenders/${tenderId}/signature/${transaction.id}/signed-document`}
              className="text-sm font-medium text-tenderos-navy hover:underline"
            >
              Télécharger le document signé
            </a>
            <a
              href={`/app/tenders/${tenderId}/signature/${transaction.id}/evidence`}
              className="text-sm font-medium text-tenderos-navy hover:underline"
            >
              Télécharger la preuve
            </a>
          </>
        ) : null}
      </div>

      {transaction.status === "SENT" ||
      transaction.status === "IN_PROGRESS" ||
      transaction.status === "SIGNED" ? (
        <div className="flex items-center gap-2 border-t border-tenderos-navy/10 pt-2">
          <span className="text-xs text-tenderos-slate">
            Ou importer manuellement un document déjà signé :
          </span>
          <FileInput
            accept="application/pdf"
            aria-label="Document signé (PDF)"
            onChange={(e) => setImportFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            disabled={isPending}
            onClick={handleImport}
            variant="secondary"
            size="sm"
          >
            Importer
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
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
    setSelectedSignatoryIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function handlePrepare() {
    if (!exportJobId || selectedSignatoryIds.length === 0) {
      setError("Sélectionnez un export final et au moins un signataire vérifié.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await prepareSignatureTransactionAction(
      tenderId,
      exportJobId,
      selectedSignatoryIds,
    );
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setSelectedSignatoryIds([]);
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
      <h2 className="text-sm font-semibold text-tenderos-navy">Transactions de signature</h2>

      {transactions.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune transaction préparée.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {transactions.map((t) => (
          <TransactionRow key={t.id} tenderId={tenderId} transaction={t} />
        ))}
      </div>

      {canApprove ? (
        <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 bg-tenderos-light p-3">
          <h3 className="text-sm font-medium text-tenderos-navy">
            Préparer une nouvelle transaction
          </h3>
          {finalExports.length === 0 ? (
            <p className="text-sm text-warning-fg">
              Aucun export FINAL disponible — une approbation dans l&apos;onglet Validation est
              requise au préalable.
            </p>
          ) : verifiedSignatories.length === 0 ? (
            <p className="text-sm text-warning-fg">
              Aucun signataire au pouvoir vérifié — vérifiez un signataire ci-dessus au préalable.
            </p>
          ) : (
            <>
              <Select
                value={exportJobId}
                onChange={(e) => setExportJobId(e.target.value)}
                className="max-w-md"
              >
                {finalExports.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.documentType} v{job.version}
                  </option>
                ))}
              </Select>
              <div className="flex flex-col gap-1">
                {verifiedSignatories.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-tenderos-navy">
                    <input
                      type="checkbox"
                      checked={selectedSignatoryIds.includes(s.id)}
                      onChange={() => toggleSignatory(s.id)}
                    />
                    {s.firstName} {s.lastName}
                  </label>
                ))}
              </div>
              <Button
                type="button"
                disabled={isPending}
                onClick={handlePrepare}
                className="self-start"
                variant="primary"
                size="sm"
              >
                {isPending ? "Préparation..." : "Préparer la transaction"}
              </Button>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-danger-fg">
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
      <RequirementsPanel
        tenderId={tenderId}
        requirements={initialRequirements}
        canManage={canManage}
        canApprove={canApprove}
      />
      <SignatoriesPanel
        tenderId={tenderId}
        signatories={initialSignatories}
        canManage={canManage}
        canApprove={canApprove}
      />
      <TransactionsPanel
        tenderId={tenderId}
        transactions={initialTransactions}
        signatories={initialSignatories}
        finalExports={finalExports}
        canApprove={canApprove}
      />
    </div>
  );
}
