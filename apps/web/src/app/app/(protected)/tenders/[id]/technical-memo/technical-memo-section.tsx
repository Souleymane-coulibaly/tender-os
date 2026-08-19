"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createTechnicalMemoAction,
  editTechnicalMemoSectionAction,
  exportTechnicalMemoAction,
  fetchTechnicalMemo,
  fetchTechnicalMemoCoverage,
  fetchTechnicalMemoFreshness,
  generateTechnicalMemoSectionAction,
  mapTechnicalMemoSectionsAction,
  prepareTechnicalMemoTemplateAction,
  validateTechnicalMemoSectionAction,
} from "../../../../technical-memo-actions";
import {
  CITATION_SOURCE_LABELS,
  MEMO_STATUS_LABELS,
  SECTION_CATEGORY_LABELS,
  SECTION_STATUS_LABELS,
  TECHNICAL_MEMO_FRESHNESS_LABELS,
  TEMPLATE_ORIGIN_LABELS,
  coverageStatusBadgeClass,
  sectionStatusBadgeClass,
  type TechnicalMemo,
  type TechnicalMemoCoverage,
  type TechnicalMemoFreshness,
  type TechnicalMemoFreshnessResult,
  type TechnicalMemoSection as TechnicalMemoSectionModel,
  type TechnicalMemoSectionCitation,
  type TechnicalMemoTemplateOrigin,
} from "../../../../../../lib/technical-memo-types";

/** Checkpoint 2.1-P2.1-FIX-D — mêmes tons que les badges Actualisation requise Analyse/Checklist/
 *  GO-NO-GO (mission §64 "pas de faux vert"). */
function freshnessBadgeClass(freshness: TechnicalMemoFreshness): string {
  switch (freshness) {
    case "CURRENT":
      return "bg-green-100 text-green-800";
    case "STALE":
      return "bg-amber-100 text-amber-800";
    case "UNKNOWN":
      return "bg-neutral-200 text-neutral-700";
  }
}
import type { GeneratedDocumentRevisionSummary } from "../../../../../../lib/document-generation-types";

/** Formulaire de création (mission §63 — deux parcours) : soit un modèle DOCX uploadé
 *  (entreprise ou trame imposée par le DCE), soit "Générer sans modèle" (modèle système
 *  TenderOS, aucun upload). */
function CreateMemoForm({ onCreated }: { onCreated: (memo: TechnicalMemo, sections: TechnicalMemoSectionModel[]) => void }) {
  const [origin, setOrigin] = useState<TechnicalMemoTemplateOrigin>("TENDEROS_SYSTEM");
  const [file, setFile] = useState<File | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (origin !== "TENDEROS_SYSTEM" && !file) {
      setError("Un fichier .docx est requis pour ce parcours.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await createTechnicalMemoAction(tenderIdFromLocation(), { templateOrigin: origin, file });
    setIsPending(false);
    if (result.error || !result.memo || !result.sections) {
      setError(result.error ?? "La création du mémoire a échoué.");
      return;
    }
    onCreated(result.memo, result.sections);
  }

  function tenderIdFromLocation(): string {
    // Le tenderId n'est pas passé en prop à ce sous-composant pour rester réutilisable — récupéré
    // depuis l'URL courante (`/app/tenders/:id/technical-memo`), jamais depuis une saisie utilisateur.
    const match = window.location.pathname.match(/\/tenders\/([^/]+)\/technical-memo/);
    return match?.[1] ?? "";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold">Créer le mémoire technique</h2>
      {error ? (
        <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["TENDEROS_SYSTEM", "COMPANY_TEMPLATE", "DCE_REQUIRED_TEMPLATE"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setOrigin(value)}
            className={`rounded border p-3 text-left text-sm ${origin === value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"}`}
          >
            <div className="font-medium">{value === "TENDEROS_SYSTEM" ? "Générer sans modèle" : TEMPLATE_ORIGIN_LABELS[value]}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {value === "TENDEROS_SYSTEM"
                ? "Utilise le modèle standard TenderOS (12 sections), aucun upload requis."
                : value === "COMPANY_TEMPLATE"
                  ? "Uploadez le modèle .docx de votre entreprise — sa structure est préservée."
                  : "Uploadez la trame .docx imposée par le pouvoir adjudicateur — jamais restructurée."}
            </div>
          </button>
        ))}
      </div>

      {origin !== "TENDEROS_SYSTEM" ? (
        <div>
          <label htmlFor="memo-file" className="block text-xs font-medium text-neutral-600">
            Fichier .docx
          </label>
          <input
            id="memo-file"
            type="file"
            accept=".docx"
            onChange={(event) => setFile(event.target.files?.[0])}
            className="mt-1 block w-full text-sm"
          />
        </div>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Analyse en cours…" : "Créer et analyser"}
      </button>
    </form>
  );
}

function CoveragePanel({ coverage }: { coverage: TechnicalMemoCoverage | undefined }) {
  if (!coverage) return null;
  if (coverage.totalRequirements === 0) {
    return <p className="rounded border border-neutral-200 p-3 text-xs text-neutral-500">Aucune exigence DCE mappée pour l&apos;instant — lancez le mapping.</p>;
  }
  return (
    <div className="rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold">
        Couverture des exigences — {coverage.covered}/{coverage.totalRequirements} ({Math.round(coverage.coverageRatio * 100)}%)
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        La couverture indique quelles exigences DCE ont été explicitement citées par l&apos;IA en rédigeant une section — ce n&apos;est jamais une note de qualité.
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className={`rounded px-2 py-1 ${coverageStatusBadgeClass("COVERED")}`}>Couvertes : {coverage.covered}</span>
        <span className={`rounded px-2 py-1 ${coverageStatusBadgeClass("PARTIALLY_COVERED")}`}>Partielles : {coverage.partiallyCovered}</span>
        <span className={`rounded px-2 py-1 ${coverageStatusBadgeClass("NOT_COVERED")}`}>Non couvertes : {coverage.notCovered}</span>
        <span className={`rounded px-2 py-1 ${coverageStatusBadgeClass("NEEDS_REVIEW")}`}>À vérifier : {coverage.needsReview}</span>
        <span className={`rounded px-2 py-1 ${coverageStatusBadgeClass("NOT_APPLICABLE")}`}>Non applicables : {coverage.notApplicable}</span>
      </div>
    </div>
  );
}

/** Une carte par section — les erreurs restent ISOLÉES à cette section (mission §67 "un échec sur
 *  la section 7 ne doit jamais supprimer les sections 1-6 déjà générées"), jamais une seule zone
 *  d'erreur globale pour tout le mémoire. */
function SectionCard({
  technicalMemoId,
  section,
  sectionFreshness,
  onUpdated,
}: {
  technicalMemoId: string;
  section: TechnicalMemoSectionModel;
  /** Checkpoint 2.1-P2.1-FIX-D — `undefined` tant que la fraîcheur n'a pas encore chargé, jamais
   *  un badge fabriqué en son absence. */
  sectionFreshness?: TechnicalMemoFreshness | undefined;
  onUpdated: (updated: TechnicalMemoSectionModel, revisionContent?: string) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [instruction, setInstruction] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(section.content ?? "");
  const [citations, setCitations] = useState<TechnicalMemoSectionCitation[]>([]);
  const [missingDataNotes, setMissingDataNotes] = useState<string[]>([]);

  async function handleGenerate(): Promise<void> {
    setError(undefined);
    setIsPending(true);
    const result = await generateTechnicalMemoSectionAction(technicalMemoId, section.id, instruction.trim() || undefined);
    setIsPending(false);
    if (result.error || !result.revision) {
      setError(result.error ?? "La génération de cette section a échoué.");
      return;
    }
    setMissingDataNotes(result.revision.missingDataNotes);
    setCitations(result.revision.citations);
    setDraftContent(result.revision.content);
    onUpdated({ ...section, content: result.revision.content, status: result.revision.missingDataNotes.length > 0 ? "NEEDS_REVIEW" : "DRAFT" });
  }

  async function handleSaveEdit(): Promise<void> {
    setError(undefined);
    setIsPending(true);
    const result = await editTechnicalMemoSectionAction(technicalMemoId, section.id, draftContent);
    setIsPending(false);
    if (result.error || !result.revision) {
      setError(result.error ?? "L'enregistrement de cette section a échoué.");
      return;
    }
    setIsEditing(false);
    onUpdated({ ...section, content: result.revision.content, status: "DRAFT" });
  }

  async function handleValidate(): Promise<void> {
    setError(undefined);
    setIsPending(true);
    const result = await validateTechnicalMemoSectionAction(technicalMemoId, section.id);
    setIsPending(false);
    if (result.error || !result.section) {
      setError(result.error ?? "La validation de cette section a échoué.");
      return;
    }
    onUpdated(result.section);
  }

  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium" style={{ paddingLeft: `${Math.max(0, section.level - 1) * 12}px` }}>
            {section.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-600">{SECTION_CATEGORY_LABELS[section.category]}</span>
            <span className={`rounded px-2 py-0.5 ${sectionStatusBadgeClass(section.status)}`}>{SECTION_STATUS_LABELS[section.status]}</span>
            {sectionFreshness === "STALE" ? <span className={`rounded px-2 py-0.5 ${freshnessBadgeClass("STALE")}`}>{TECHNICAL_MEMO_FRESHNESS_LABELS.STALE}</span> : null}
            {section.isTable ? <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-600">Tableau</span> : null}
            {section.wordLimit ? <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-600">Limite : {section.wordLimit} mots</span> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleGenerate} disabled={isPending} className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {isPending ? "…" : section.content ? "Régénérer" : "Générer"}
          </button>
          {section.content && section.status !== "VALIDATED" ? (
            <button type="button" onClick={handleValidate} disabled={isPending} className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Valider
            </button>
          ) : null}
        </div>
      </div>

      {section.instructionText ? <p className="mt-2 text-xs italic text-neutral-500">Consigne du modèle : {section.instructionText}</p> : null}

      {error ? (
        <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {section.content ? (
        <div className="mt-2">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={6} className="w-full rounded border border-neutral-300 p-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveEdit} disabled={isPending} className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                  Enregistrer
                </button>
                <button type="button" onClick={() => { setIsEditing(false); setDraftContent(section.content ?? ""); }} className="rounded border border-neutral-300 px-3 py-1 text-xs">
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="whitespace-pre-wrap rounded bg-neutral-50 p-2 text-sm">{section.content}</p>
              <button type="button" onClick={() => setIsEditing(true)} className="mt-1 text-xs text-blue-700 underline hover:text-blue-900">
                Modifier le texte
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">Aucun contenu généré pour l&apos;instant.</p>
      )}

      {missingDataNotes.length > 0 ? (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
          <span className="font-medium">Informations manquantes :</span> {missingDataNotes.join(" · ")}
        </div>
      ) : null}

      {citations.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-600">Sources ({citations.length})</summary>
          <ul className="mt-1 flex flex-col gap-1 border-l-2 border-neutral-200 pl-2">
            {citations.map((citation) => (
              <li key={citation.id} className="text-xs text-neutral-600">
                <span className="font-medium text-neutral-500">[{CITATION_SOURCE_LABELS[citation.sourceType]}]</span> {citation.label}
                {citation.excerpt ? <span className="text-neutral-400"> — {citation.excerpt.slice(0, 140)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-2">
        <label className="text-xs text-neutral-500" htmlFor={`instruction-${section.id}`}>
          Instruction pour la (re)génération (optionnel)
        </label>
        <input
          id={`instruction-${section.id}`}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ex. insister davantage sur la cybersécurité"
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}

function MemoDetail({ tenderId, memo, sections, onMemoUpdated }: { tenderId: string; memo: TechnicalMemo; sections: TechnicalMemoSectionModel[]; onMemoUpdated: (memo: TechnicalMemo) => void }) {
  const [localSections, setLocalSections] = useState(sections);
  const [coverage, setCoverage] = useState<TechnicalMemoCoverage | undefined>();
  const [freshness, setFreshness] = useState<TechnicalMemoFreshnessResult | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [exportRevision, setExportRevision] = useState<GeneratedDocumentRevisionSummary | undefined>();

  useEffect(() => {
    setLocalSections(sections);
  }, [sections]);

  async function loadCoverage(): Promise<void> {
    try {
      setCoverage(await fetchTechnicalMemoCoverage(memo.id));
    } catch {
      // Non bloquant — la couverture reste un indicateur secondaire.
    }
  }

  // Checkpoint 2.1-P2.1-FIX-D — rechargée après CHAQUE action mutante (génération/édition/export),
  // jamais figée depuis le premier chargement de la page (mission §64 "pas de faux vert").
  async function loadFreshness(): Promise<void> {
    setFreshness(await fetchTechnicalMemoFreshness(memo.id));
  }

  useEffect(() => {
    void loadCoverage();
    void loadFreshness();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCoverage/loadFreshness ferment sur memo.id, stable pour ce mémoire.
  }, [memo.id]);

  async function handlePrepare(): Promise<void> {
    setError(undefined);
    setIsPreparing(true);
    const result = await prepareTechnicalMemoTemplateAction(tenderId, memo.id);
    setIsPreparing(false);
    if (result.error || !result.memo) {
      setError(result.error ?? "La préparation du gabarit a échoué.");
      return;
    }
    onMemoUpdated(result.memo);
  }

  async function handleMap(): Promise<void> {
    setError(undefined);
    setIsMapping(true);
    const result = await mapTechnicalMemoSectionsAction(memo.id);
    setIsMapping(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadCoverage();
  }

  async function handleExport(): Promise<void> {
    setError(undefined);
    setIsExporting(true);
    const result = await exportTechnicalMemoAction(memo.id);
    setIsExporting(false);
    if (result.error || !result.revision) {
      setError(result.error ?? "L'export du DOCX final a échoué.");
      return;
    }
    setExportRevision(result.revision);
  }

  const validatedCount = localSections.filter((s) => s.status === "VALIDATED").length;
  const needsReviewCount = localSections.filter((s) => s.status === "NEEDS_REVIEW").length;
  const emptyCount = localSections.filter((s) => !s.content).length;
  const sectionFreshnessById = new Map((freshness?.sections ?? []).map((s) => [s.technicalMemoSectionId, s.freshness]));
  // Checkpoint 2.1-P2.1-FIX-D (mission §49/§66) — jamais un export incohérent proposé : bloqué
  // proactivement côté UI dès que la fraîcheur est chargée et non CURRENT (le backend reste la
  // seule autorité réelle, revalidée à chaque appel).
  const exportBlockedByFreshness = freshness !== null && freshness.freshness !== "CURRENT";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-200 p-3">
        <div>
          <p className="text-sm font-medium">
            {TEMPLATE_ORIGIN_LABELS[memo.templateOrigin]} — <span className="text-neutral-500">{MEMO_STATUS_LABELS[memo.status]}</span>
            {freshness ? (
              <span className={`ml-2 rounded px-2 py-0.5 align-middle text-xs ${freshnessBadgeClass(freshness.freshness)}`}>{TECHNICAL_MEMO_FRESHNESS_LABELS[freshness.freshness]}</span>
            ) : null}
          </p>
          <p className="text-xs text-neutral-500">
            Sections : {localSections.length} · Validées : {validatedCount} · À revoir : {needsReviewCount} · Sans contenu : {emptyCount}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleMap} disabled={isMapping} className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {isMapping ? "Mapping…" : "Mapper aux exigences DCE"}
          </button>
          <button type="button" onClick={handlePrepare} disabled={isPreparing || !!memo.documentTemplateId} className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {memo.documentTemplateId ? "Gabarit prêt" : isPreparing ? "Préparation…" : "Préparer le gabarit"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || !memo.documentTemplateId || exportBlockedByFreshness}
            title={exportBlockedByFreshness ? "Actualisez et régénérez les sections obsolètes avant d'exporter la version finale." : undefined}
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {isExporting ? "Export…" : "Exporter le DOCX final"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {exportRevision ? (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-xs text-green-800">
          {exportRevision.status === "COMPLETED" ? (
            <>
              DOCX généré (révision #{exportRevision.revisionNumber}).{" "}
              <Link href={`/app/tenders/${tenderId}/documents-generated`} className="underline hover:text-green-900">
                Voir les documents générés
              </Link>
            </>
          ) : (
            `Export en statut ${exportRevision.status}${exportRevision.errorMessage ? ` — ${exportRevision.errorMessage}` : ""}`
          )}
        </div>
      ) : null}

      <CoveragePanel coverage={coverage} />

      <div className="flex flex-col gap-3">
        {localSections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <SectionCard
              key={section.id}
              technicalMemoId={memo.id}
              section={section}
              sectionFreshness={sectionFreshnessById.get(section.id)}
              onUpdated={(updated) => {
                setLocalSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                void loadFreshness();
              }}
            />
          ))}
      </div>
    </div>
  );
}

export function TechnicalMemoSection({ tenderId, initialMemos }: { tenderId: string; initialMemos: TechnicalMemo[] }) {
  const [memos, setMemos] = useState(initialMemos);
  const [selectedMemoId, setSelectedMemoId] = useState<string | undefined>(initialMemos[0]?.id);
  const [sections, setSections] = useState<TechnicalMemoSectionModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function loadMemo(memoId: string): Promise<void> {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await fetchTechnicalMemo(memoId);
      setMemos((prev) => prev.map((m) => (m.id === memoId ? result.memo : m)));
      setSections(result.sections);
    } catch {
      setError("Impossible de charger ce mémoire technique.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedMemoId) void loadMemo(selectedMemoId);
  }, [selectedMemoId]);

  const selectedMemo = memos.find((m) => m.id === selectedMemoId);

  if (!selectedMemo) {
    return <CreateMemoForm onCreated={(memo, createdSections) => { setMemos((prev) => [memo, ...prev]); setSections(createdSections); setSelectedMemoId(memo.id); }} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : null}
      {!isLoading ? (
        <MemoDetail
          tenderId={tenderId}
          memo={selectedMemo}
          sections={sections}
          onMemoUpdated={(updated) => setMemos((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
        />
      ) : null}
    </div>
  );
}
