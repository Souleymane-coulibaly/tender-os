"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveDeliverableAction,
  compareRevisionsAction,
  createManualRevisionAction,
  createRevisionFromGenerationAction,
  decideRevisionReviewAction,
  generateSectionAction,
  getGenerationStatusAction,
  listSectionRevisionsAction,
  previewDeliverableAction,
  restoreRevisionAction,
  saveRevisionDraftAction,
  selectRevisionForExportAction,
  submitRevisionForReviewAction,
  updateDeliverableSectionAction,
} from "../../../../../deliverable-actions";
import {
  DELIVERABLE_STATUS_LABELS,
  REVISION_STATUS_LABELS,
  canManageDeliverable,
  canValidateDeliverable,
  deliverableStatusBadgeClass,
  revisionStatusBadgeClass,
  type DeliverableRevisionSummary,
  type DeliverableSectionSummary,
  type DeliverableSummary,
  type RenderableBlock,
} from "../../../../../../../lib/deliverable-types";

const BLOCK_KIND_LABELS: Record<string, string> = { heading: "Titre", paragraph: "Paragraphe", list: "Liste", notice: "Encadré" };

function characterCount(blocks: RenderableBlock[]): number {
  return blocks
    .map((b) => {
      if (b.kind === "heading" || b.kind === "paragraph" || b.kind === "notice") return b.text.length;
      if (b.kind === "list") return b.items.join("").length;
      return 0;
    })
    .reduce((a, b) => a + b, 0);
}

function emptyParagraph(): RenderableBlock {
  return { kind: "paragraph", text: "" };
}

/**
 * Mission Sprint 8A.1 §9 — "évite un clone de Microsoft Word" : éditeur MINIMAL mais réel —
 * paragraphes/titres/listes/encadrés, gras/italique/lien par bloc (un run par paragraphe, pas par
 * mot), compteur de caractères, annuler/rétablir (pile de snapshots locale), état de sauvegarde,
 * verrou optimiste (conflit explicite si `editVersion` a changé entre-temps).
 */
export function MemoEditor({ tenderId, deliverable, actorRole }: { tenderId: string; deliverable: DeliverableSummary; actorRole: string | undefined }) {
  const sections = [...(deliverable.sections ?? [])].sort((a, b) => a.order - b.order);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>(sections[0]?.id);
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${deliverableStatusBadgeClass(deliverable.status)}`}>{DELIVERABLE_STATUS_LABELS[deliverable.status] ?? deliverable.status}</span>
          {deliverable.approvedAt ? <span className="text-xs text-neutral-500">Approuvé le {new Date(deliverable.approvedAt).toLocaleDateString("fr-FR")}</span> : null}
        </div>
        <ApproveDeliverableButton tenderId={tenderId} deliverable={deliverable} actorRole={actorRole} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-1">
          {sections.length === 0 ? (
            <p className="text-sm text-neutral-600">Aucune section — activez un template de mémoire (Identité documentaire → Templates) pour matérialiser la structure.</p>
          ) : (
            sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm ${
                  section.id === selectedSectionId ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <span>
                  {section.title}
                  {section.mandatory ? " *" : ""}
                </span>
              </button>
            ))
          )}
          <PreviewButton tenderId={tenderId} deliverableId={deliverable.id} />
        </aside>
        <div>{selectedSection ? <SectionEditor key={selectedSection.id} tenderId={tenderId} deliverable={deliverable} section={selectedSection} actorRole={actorRole} /> : null}</div>
      </div>
    </div>
  );
}

function ApproveDeliverableButton({ tenderId, deliverable, actorRole }: { tenderId: string; deliverable: DeliverableSummary; actorRole: string | undefined }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!canValidateDeliverable(actorRole) || deliverable.status === "APPROVED" || deliverable.status === "EXPORTED") return null;

  async function handleApprove() {
    setIsPending(true);
    setError(undefined);
    const result = await approveDeliverableAction(tenderId, deliverable.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={isPending} onClick={handleApprove} className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Approbation..." : "Approuver le livrable"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PreviewButton({ tenderId, deliverableId }: { tenderId: string; deliverableId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();

  async function handlePreview() {
    setIsPending(true);
    setError(undefined);
    const result = await previewDeliverableAction(tenderId, deliverableId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else setJobId(result.jobId);
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4">
      <button type="button" disabled={isPending} onClick={handlePreview} className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-50">
        {isPending ? "Génération de l'aperçu..." : "Aperçu DOCX/PDF"}
      </button>
      {jobId ? (
        <a href={`/app/tenders/${tenderId}/export`} className="text-xs text-neutral-900 hover:underline">
          Voir l&apos;aperçu dans Export →
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SectionEditor({
  tenderId,
  deliverable,
  section,
  actorRole,
}: {
  tenderId: string;
  deliverable: DeliverableSummary;
  section: DeliverableSectionSummary;
  actorRole: string | undefined;
}) {
  const router = useRouter();
  const canManage = canManageDeliverable(actorRole);
  const canEdit = canManage && !section.locked;
  const canValidate = canValidateDeliverable(actorRole);

  const [revisions, setRevisions] = useState<DeliverableRevisionSummary[] | undefined>();
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [pendingGenerationId, setPendingGenerationId] = useState<string | undefined>();

  const [blocks, setBlocks] = useState<RenderableBlock[]>([]);
  const [history, setHistory] = useState<RenderableBlock[][]>([]);
  const [future, setFuture] = useState<RenderableBlock[][]>([]);
  const [editingRevisionId, setEditingRevisionId] = useState<string | undefined>();
  const [editVersion, setEditVersion] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "conflict">("idle");

  const [compareFrom, setCompareFrom] = useState<string>("");
  const [compareTo, setCompareTo] = useState<string>("");
  const [diff, setDiff] = useState<{ addedLines: string[]; removedLines: string[] } | undefined>();

  async function loadRevisions() {
    setIsLoadingRevisions(true);
    const result = await listSectionRevisionsAction(section.id);
    setIsLoadingRevisions(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRevisions(result.revisions ?? []);
  }

  if (revisions === undefined && !isLoadingRevisions) {
    void loadRevisions();
  }

  const latest = revisions?.[0];

  function startEditing(revision: DeliverableRevisionSummary) {
    setEditingRevisionId(revision.id);
    setBlocks(revision.contentStructured);
    setEditVersion(revision.editVersion);
    setHistory([]);
    setFuture([]);
    setSaveState("idle");
  }

  function pushHistory(next: RenderableBlock[]) {
    setHistory((h) => [...h, blocks]);
    setFuture([]);
    setBlocks(next);
    setSaveState("idle");
  }

  function undo() {
    if (history.length === 0) return;
    const previous = history[history.length - 1]!;
    setFuture((f) => [blocks, ...f]);
    setHistory((h) => h.slice(0, -1));
    setBlocks(previous);
  }

  function redo() {
    if (future.length === 0) return;
    const next = future[0]!;
    setHistory((h) => [...h, blocks]);
    setFuture((f) => f.slice(1));
    setBlocks(next);
  }

  async function handleGenerate() {
    setIsPending(true);
    setError(undefined);
    const result = await generateSectionAction(tenderId, section.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else setPendingGenerationId(result.generationId);
  }

  async function handleCheckGeneration() {
    if (!pendingGenerationId) return;
    setIsPending(true);
    const status = await getGenerationStatusAction(pendingGenerationId);
    setIsPending(false);
    if (status.error) {
      setError(status.error);
      return;
    }
    if (status.status !== "GENERATED") {
      setError(`Génération en cours (${status.status}) — réessayez dans un instant.`);
      return;
    }
    const result = await createRevisionFromGenerationAction(tenderId, deliverable.id, section.id, pendingGenerationId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPendingGenerationId(undefined);
    await loadRevisions();
    router.refresh();
  }

  async function handleCreateManualDraft() {
    setIsPending(true);
    setError(undefined);
    const result = await createManualRevisionAction(tenderId, deliverable.id, section.id, [emptyParagraph()]);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadRevisions();
    if (result.revision) startEditing(result.revision);
  }

  async function handleSaveDraft() {
    if (!editingRevisionId) return;
    setIsPending(true);
    setError(undefined);
    const result = await saveRevisionDraftAction(tenderId, deliverable.id, section.id, editingRevisionId, blocks, editVersion);
    setIsPending(false);
    if (result.error) {
      setSaveState("conflict");
      setError(result.error);
      return;
    }
    setSaveState("saved");
    setEditVersion(result.revision?.editVersion ?? editVersion + 1);
    await loadRevisions();
    router.refresh();
  }

  async function run(action: () => Promise<{ error?: string }>) {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      await loadRevisions();
      router.refresh();
    }
  }

  async function handleCompare() {
    if (!compareFrom || !compareTo) return;
    setError(undefined);
    const result = await compareRevisionsAction(section.id, compareFrom, compareTo);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDiff({ addedLines: result.addedLines ?? [], removedLines: result.removedLines ?? [] });
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">{section.title}</h2>
        <div className="flex items-center gap-2">
          {section.locked ? <span className="text-xs text-amber-700">Verrouillée</span> : null}
          {section.hidden ? <span className="text-xs text-neutral-500">Masquée</span> : null}
          {canManage ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => updateDeliverableSectionAction(tenderId, deliverable.id, section.id, { locked: !section.locked }))}
                className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50"
              >
                {section.locked ? "Déverrouiller" : "Verrouiller"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => updateDeliverableSectionAction(tenderId, deliverable.id, section.id, { hidden: !section.hidden }))}
                className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50"
              >
                {section.hidden ? "Afficher" : "Masquer"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} onClick={handleGenerate} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
            Générer par IA
          </button>
          {pendingGenerationId ? (
            <button type="button" disabled={isPending} onClick={handleCheckGeneration} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Vérifier / créer la révision
            </button>
          ) : null}
          <button type="button" disabled={isPending} onClick={handleCreateManualDraft} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
            Rédiger manuellement
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {editingRevisionId ? (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              {characterCount(blocks)} caractères · {saveState === "saved" ? "Enregistré" : saveState === "conflict" ? "Conflit — rechargez" : "Non enregistré"}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={history.length === 0} onClick={undo} className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40">
                Annuler
              </button>
              <button type="button" disabled={future.length === 0} onClick={redo} className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40">
                Rétablir
              </button>
            </div>
          </div>

          {blocks.map((block, index) => (
            <BlockEditor
              key={index}
              block={block}
              onChange={(next) => {
                const copy = [...blocks];
                copy[index] = next;
                pushHistory(copy);
              }}
              onRemove={() => pushHistory(blocks.filter((_, i) => i !== index))}
            />
          ))}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pushHistory([...blocks, emptyParagraph()])} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
              + Paragraphe
            </button>
            <button type="button" onClick={() => pushHistory([...blocks, { kind: "heading", level: 2, text: "" }])} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
              + Titre
            </button>
            <button type="button" onClick={() => pushHistory([...blocks, { kind: "list", items: [""], ordered: false }])} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
              + Liste
            </button>
          </div>

          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={handleSaveDraft} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Enregistrer le brouillon
            </button>
            <button type="button" onClick={() => setEditingRevisionId(undefined)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Historique des révisions</h3>
        {isLoadingRevisions ? <p className="text-sm text-neutral-500">Chargement...</p> : null}
        {revisions?.length === 0 ? <p className="text-sm text-neutral-600">Aucune révision pour l&apos;instant.</p> : null}
        {revisions?.map((revision) => (
          <div key={revision.id} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-800">
                Révision #{revision.revisionNumber} — {revision.sourceType === "AI_GENERATED" ? "IA" : revision.sourceType === "RESTORED" ? "Restaurée" : "Manuelle"}
              </span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${revisionStatusBadgeClass(revision.status)}`}>{REVISION_STATUS_LABELS[revision.status] ?? revision.status}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{revision.contentText.slice(0, 400)}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {canEdit && revision.status === "DRAFT" ? (
                <button type="button" onClick={() => startEditing(revision)} className="rounded border border-neutral-300 px-2 py-1 text-neutral-700">
                  Éditer
                </button>
              ) : null}
              {canEdit && revision.status === "DRAFT" ? (
                <button type="button" disabled={isPending} onClick={() => run(() => submitRevisionForReviewAction(tenderId, deliverable.id, section.id, revision.id))} className="rounded border border-neutral-300 px-2 py-1 text-neutral-700 disabled:opacity-50">
                  Soumettre à revue
                </button>
              ) : null}
              {canValidate && revision.status === "READY_FOR_REVIEW" ? (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => decideRevisionReviewAction(tenderId, deliverable.id, section.id, revision.id, "APPROVED"))}
                    className="rounded bg-green-700 px-2 py-1 text-white disabled:opacity-50"
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => decideRevisionReviewAction(tenderId, deliverable.id, section.id, revision.id, "CHANGES_REQUESTED"))}
                    className="rounded border border-amber-400 px-2 py-1 text-amber-700 disabled:opacity-50"
                  >
                    Demander des modifications
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => decideRevisionReviewAction(tenderId, deliverable.id, section.id, revision.id, "REJECTED"))}
                    className="rounded border border-red-400 px-2 py-1 text-red-700 disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                </>
              ) : null}
              {canValidate && revision.status === "VALIDATED" ? (
                <button type="button" disabled={isPending} onClick={() => run(() => selectRevisionForExportAction(tenderId, deliverable.id, section.id, revision.id))} className="rounded bg-neutral-900 px-2 py-1 text-white disabled:opacity-50">
                  Sélectionner pour l&apos;export
                </button>
              ) : null}
              {canEdit && revision.id !== latest?.id ? (
                <button type="button" disabled={isPending} onClick={() => run(() => restoreRevisionAction(tenderId, deliverable.id, section.id, revision.id))} className="rounded border border-neutral-300 px-2 py-1 text-neutral-700 disabled:opacity-50">
                  Restaurer comme nouvelle révision
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {revisions && revisions.length >= 2 ? (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Comparer deux révisions</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm">
              <option value="">De…</option>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.revisionNumber}
                </option>
              ))}
            </select>
            <select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm">
              <option value="">Vers…</option>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.revisionNumber}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleCompare} className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-700">
              Comparer
            </button>
          </div>
          {diff ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="mb-1 font-semibold text-red-700">Supprimé</p>
                {diff.removedLines.map((line, i) => (
                  <p key={i} className="text-red-700">
                    − {line}
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 font-semibold text-green-700">Ajouté</p>
                {diff.addedLines.map((line, i) => (
                  <p key={i} className="text-green-700">
                    + {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildRun(text: string, bold: boolean | undefined, italic: boolean | undefined, href: string | undefined) {
  return { text, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}), ...(href ? { href } : {}) };
}

function BlockEditor({ block, onChange, onRemove }: { block: RenderableBlock; onChange: (next: RenderableBlock) => void; onRemove: () => void }) {
  if (block.kind === "pageBreak") return null;

  const run = block.kind === "paragraph" ? block.runs?.[0] : undefined;

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 p-2">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{BLOCK_KIND_LABELS[block.kind] ?? block.kind}</span>
        <button type="button" onClick={onRemove} className="text-red-600 hover:underline">
          Supprimer
        </button>
      </div>

      {block.kind === "heading" || block.kind === "paragraph" || block.kind === "notice" ? (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          rows={2}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      ) : null}

      {block.kind === "paragraph" ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={run?.bold ?? false}
              onChange={(e) => onChange({ ...block, runs: [buildRun(block.text, e.target.checked, run?.italic, run?.href)] })}
            />
            Gras
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={run?.italic ?? false}
              onChange={(e) => onChange({ ...block, runs: [buildRun(block.text, run?.bold, e.target.checked, run?.href)] })}
            />
            Italique
          </label>
          <input
            type="url"
            placeholder="Lien (https://…)"
            value={run?.href ?? ""}
            onChange={(e) => onChange({ ...block, runs: e.target.value ? [buildRun(block.text, run?.bold, run?.italic, e.target.value)] : undefined })}
            className="flex-1 rounded border border-neutral-300 px-2 py-1"
          />
        </div>
      ) : null}

      {block.kind === "list" ? (
        <>
          <textarea
            value={block.items.join("\n")}
            onChange={(e) => onChange({ ...block, items: e.target.value.split("\n") })}
            rows={3}
            placeholder="Un élément par ligne"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-neutral-600">
            <input type="checkbox" checked={block.ordered} onChange={(e) => onChange({ ...block, ordered: e.target.checked })} />
            Liste numérotée
          </label>
        </>
      ) : null}
    </div>
  );
}
