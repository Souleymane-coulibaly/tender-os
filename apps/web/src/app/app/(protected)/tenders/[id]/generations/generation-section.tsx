"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelGenerationAction,
  editGenerationAction,
  launchGenerationAction,
  regenerateGenerationAction,
  rejectGenerationAction,
  retryGenerationAction,
  validateGenerationAction,
} from "../../../../generation-actions";
import {
  describeGenerationFailureCode,
  GENERATION_CAPABILITY_REASON_LABELS,
  GENERATION_STATUS_LABELS,
  generationStatusBadgeClass,
  type GenerationCapability,
  type GenerationSummary,
} from "../../../../../../lib/generation-types";

function canLaunchGeneration(actorRole: string | undefined): boolean {
  // Vérification UI uniquement, jamais l'autorité — le backend revalide systématiquement via
  // AssertClientAccessUseCase (ManageGeneration), y compris pour une affectation client sans lien
  // avec le rôle d'organisation (mission §"Le frontend ne doit pas calculer les permissions seul").
  return actorRole !== "READ_ONLY" && actorRole !== undefined;
}

function canSeeCost(generation: GenerationSummary): boolean {
  return generation.estimatedCostAmount !== undefined || generation.inputTokenCount !== undefined;
}

export function GenerationSection({
  tenderId,
  initialGenerations,
  actorRole,
  taskTypeLabels,
  capabilities,
}: {
  tenderId: string;
  initialGenerations: GenerationSummary[];
  actorRole: string | undefined;
  taskTypeLabels: Record<string, string>;
  capabilities: GenerationCapability[];
}) {
  const router = useRouter();
  const [taskType, setTaskType] = useState(Object.keys(taskTypeLabels)[0] ?? "EXECUTIVE_SUMMARY");
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | undefined>();

  const capabilityByTaskType = new Map(capabilities.map((capability) => [capability.taskType, capability]));
  const selectedCapability = capabilityByTaskType.get(taskType);
  const isSelectedTaskTypeReady = selectedCapability?.ready ?? true;

  async function handleLaunch() {
    setIsLaunching(true);
    setLaunchError(undefined);
    const result = await launchGenerationAction(tenderId, taskType);
    setIsLaunching(false);
    if (result.error) {
      setLaunchError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canLaunchGeneration(actorRole) ? (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Lancer une génération</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="taskType" className="text-sm font-medium text-neutral-700">
                Type de contenu
              </label>
              <select
                id="taskType"
                value={taskType}
                onChange={(event) => setTaskType(event.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                {Object.entries(taskTypeLabels).map(([value, label]) => {
                  const ready = capabilityByTaskType.get(value)?.ready ?? true;
                  return (
                    <option key={value} value={value}>
                      {ready ? label : `${label} (non configuré)`}
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isLaunching || !isSelectedTaskTypeReady}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isLaunching ? "Lancement..." : "Générer"}
            </button>
          </div>
          {!isSelectedTaskTypeReady && selectedCapability?.reasonCode ? (
            <p role="alert" className="text-sm text-amber-700">
              {GENERATION_CAPABILITY_REASON_LABELS[selectedCapability.reasonCode]}
            </p>
          ) : null}
          {launchError ? (
            <p role="alert" className="text-sm text-red-600">
              {launchError}
            </p>
          ) : null}
        </div>
      ) : null}

      {initialGenerations.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune génération pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {initialGenerations.map((generation) => (
            <GenerationCard key={generation.id} tenderId={tenderId} generation={generation} taskTypeLabels={taskTypeLabels} actorRole={actorRole} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationCard({
  tenderId,
  generation,
  taskTypeLabels,
  actorRole,
}: {
  tenderId: string;
  generation: GenerationSummary;
  taskTypeLabels: Record<string, string>;
  actorRole: string | undefined;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(generation.editedContent ?? generation.generatedContent ?? "");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  async function run(action: () => Promise<{ error?: string }>) {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  const content = generation.editedContent ?? generation.generatedContent;
  const canAct = actorRole !== "READ_ONLY" && actorRole !== undefined;

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-neutral-900">{taskTypeLabels[generation.taskType] ?? generation.taskType}</span>
          <span className="ml-2 text-xs text-neutral-500">version {generation.version}</span>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${generationStatusBadgeClass(generation.status)}`}>
          {GENERATION_STATUS_LABELS[generation.status] ?? generation.status}
        </span>
      </div>

      {generation.status === "FAILED" ? (
        <p className="text-sm text-red-600">Échec : {describeGenerationFailureCode(generation.errorCode)}</p>
      ) : null}

      {content ? (
        isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editedContent}
              onChange={(event) => setEditedContent(event.target.value)}
              rows={8}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await editGenerationAction(tenderId, generation.id, editedContent);
                    if (!result.error) setIsEditing(false);
                    return result;
                  })
                }
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-sm text-neutral-800">{content}</p>
        )
      ) : null}

      {generation.modelKey ? (
        <p className="text-xs text-neutral-500">
          Modèle : {generation.modelProvider}/{generation.modelKey}
          {generation.fallbackLevel > 0 ? " (escalade)" : ""}
        </p>
      ) : null}

      {canSeeCost(generation) ? (
        <p className="text-xs text-neutral-500">
          {generation.totalTokenCount !== undefined ? `${generation.totalTokenCount} tokens` : null}
          {generation.estimatedCostAmount ? ` · ${generation.estimatedCostAmount} ${generation.currency ?? ""}` : null}
        </p>
      ) : null}

      {generation.validatedAt ? (
        <p className="text-xs text-green-700">Validée le {new Date(generation.validatedAt).toLocaleString("fr-FR")}</p>
      ) : null}

      {generation.rejectedAt ? (
        <p className="text-xs text-red-700">
          Rejetée le {new Date(generation.rejectedAt).toLocaleString("fr-FR")}
          {generation.rejectionReason ? ` : ${generation.rejectionReason}` : ""}
        </p>
      ) : null}

      {canAct && isRejecting ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`reject-reason-${generation.id}`} className="text-sm font-medium text-neutral-700">
            Raison du rejet (optionnelle)
          </label>
          <textarea
            id={`reject-reason-${generation.id}`}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            rows={3}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await rejectGenerationAction(tenderId, generation.id, rejectionReason.trim() || undefined);
                  if (!result.error) setIsRejecting(false);
                  return result;
                })
              }
              className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirmer le rejet
            </button>
            <button
              type="button"
              onClick={() => setIsRejecting(false)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          {generation.status === "FAILED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => retryGenerationAction(tenderId, generation.id))}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
            >
              Réessayer
            </button>
          ) : null}
          {generation.status === "GENERATED" ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => regenerateGenerationAction(tenderId, generation.id))}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
              >
                Régénérer
              </button>
              {!isEditing ? (
                <button type="button" onClick={() => setIsEditing(true)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                  Éditer
                </button>
              ) : null}
              {!generation.validatedAt && !generation.rejectedAt ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => validateGenerationAction(tenderId, generation.id))}
                  className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Valider
                </button>
              ) : null}
              {!generation.validatedAt && !generation.rejectedAt && !isRejecting ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsRejecting(true)}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                >
                  Rejeter
                </button>
              ) : null}
            </>
          ) : null}
          {(generation.status === "PENDING" || generation.status === "GENERATING") ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => cancelGenerationAction(tenderId, generation.id))}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
            >
              Annuler
            </button>
          ) : null}
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
