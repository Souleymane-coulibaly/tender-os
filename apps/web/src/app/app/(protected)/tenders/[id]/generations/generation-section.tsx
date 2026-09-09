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
import { Button } from "../../../../../../components/ui/button";
import { Select } from "../../../../../../components/ui/select";
import { Textarea } from "../../../../../../components/ui/textarea";

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

  const capabilityByTaskType = new Map(
    capabilities.map((capability) => [capability.taskType, capability]),
  );
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
        <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-4">
          <h2 className="text-sm font-semibold text-tenderos-navy">Lancer une génération</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="taskType" className="text-sm font-medium text-tenderos-navy">
                Type de contenu
              </label>
              <Select
                id="taskType"
                value={taskType}
                onChange={(event) => setTaskType(event.target.value)}
              >
                {Object.entries(taskTypeLabels).map(([value, label]) => {
                  const ready = capabilityByTaskType.get(value)?.ready ?? true;
                  return (
                    <option key={value} value={value}>
                      {ready ? label : `${label} (non configuré)`}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleLaunch}
              disabled={isLaunching || !isSelectedTaskTypeReady}
              variant="primary"
              size="sm"
            >
              {isLaunching ? "Lancement..." : "Générer"}
            </Button>
          </div>
          {!isSelectedTaskTypeReady && selectedCapability?.reasonCode ? (
            <p role="alert" className="text-sm text-warning-fg">
              {GENERATION_CAPABILITY_REASON_LABELS[selectedCapability.reasonCode]}
            </p>
          ) : null}
          {launchError ? (
            <p role="alert" className="text-sm text-danger-fg">
              {launchError}
            </p>
          ) : null}
        </div>
      ) : null}

      {initialGenerations.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune génération pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {initialGenerations.map((generation) => (
            <GenerationCard
              key={generation.id}
              tenderId={tenderId}
              generation={generation}
              taskTypeLabels={taskTypeLabels}
              actorRole={actorRole}
            />
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
  const [editedContent, setEditedContent] = useState(
    generation.editedContent ?? generation.generatedContent ?? "",
  );
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
    <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-tenderos-navy">
            {taskTypeLabels[generation.taskType] ?? generation.taskType}
          </span>
          <span className="ml-2 text-xs text-tenderos-slate">version {generation.version}</span>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${generationStatusBadgeClass(generation.status)}`}
        >
          {GENERATION_STATUS_LABELS[generation.status] ?? generation.status}
        </span>
      </div>

      {generation.status === "FAILED" ? (
        <p className="text-sm text-danger-fg">
          Échec : {describeGenerationFailureCode(generation.errorCode)}
        </p>
      ) : null}

      {content ? (
        isEditing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={editedContent}
              onChange={(event) => setEditedContent(event.target.value)}
              rows={8}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await editGenerationAction(
                      tenderId,
                      generation.id,
                      editedContent,
                    );
                    if (!result.error) setIsEditing(false);
                    return result;
                  })
                }
                variant="primary"
                size="sm"
              >
                Enregistrer
              </Button>
              <Button
                type="button"
                onClick={() => setIsEditing(false)}
                variant="secondary"
                size="sm"
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap rounded bg-tenderos-light p-3 text-sm text-tenderos-navy">
            {content}
          </p>
        )
      ) : null}

      {generation.modelKey ? (
        <p className="text-xs text-tenderos-slate">
          Modèle : {generation.modelProvider}/{generation.modelKey}
          {generation.fallbackLevel > 0 ? " (escalade)" : ""}
        </p>
      ) : null}

      {canSeeCost(generation) ? (
        <p className="text-xs text-tenderos-slate">
          {generation.totalTokenCount !== undefined ? `${generation.totalTokenCount} tokens` : null}
          {generation.estimatedCostAmount
            ? ` · ${generation.estimatedCostAmount} ${generation.currency ?? ""}`
            : null}
        </p>
      ) : null}

      {generation.validatedAt ? (
        <p className="text-xs text-success-fg">
          Validée le {new Date(generation.validatedAt).toLocaleString("fr-FR")}
        </p>
      ) : null}

      {generation.rejectedAt ? (
        <p className="text-xs text-danger-fg">
          Rejetée le {new Date(generation.rejectedAt).toLocaleString("fr-FR")}
          {generation.rejectionReason ? ` : ${generation.rejectionReason}` : ""}
        </p>
      ) : null}

      {canAct && isRejecting ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`reject-reason-${generation.id}`}
            className="text-sm font-medium text-tenderos-navy"
          >
            Raison du rejet (optionnelle)
          </label>
          <Textarea
            id={`reject-reason-${generation.id}`}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await rejectGenerationAction(
                    tenderId,
                    generation.id,
                    rejectionReason.trim() || undefined,
                  );
                  if (!result.error) setIsRejecting(false);
                  return result;
                })
              }
              variant="danger"
              size="sm"
            >
              Confirmer le rejet
            </Button>
            <Button
              type="button"
              onClick={() => setIsRejecting(false)}
              variant="secondary"
              size="sm"
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          {generation.status === "FAILED" ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => run(() => retryGenerationAction(tenderId, generation.id))}
              variant="secondary"
              size="sm"
            >
              Réessayer
            </Button>
          ) : null}
          {generation.status === "GENERATED" ? (
            <>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => run(() => regenerateGenerationAction(tenderId, generation.id))}
                variant="secondary"
                size="sm"
              >
                Régénérer
              </Button>
              {!isEditing ? (
                <Button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  variant="secondary"
                  size="sm"
                >
                  Éditer
                </Button>
              ) : null}
              {!generation.validatedAt && !generation.rejectedAt ? (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => validateGenerationAction(tenderId, generation.id))}
                  variant="primary"
                  size="sm"
                >
                  Valider
                </Button>
              ) : null}
              {!generation.validatedAt && !generation.rejectedAt && !isRejecting ? (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsRejecting(true)}
                  variant="danger"
                  size="sm"
                >
                  Rejeter
                </Button>
              ) : null}
            </>
          ) : null}
          {generation.status === "PENDING" || generation.status === "GENERATING" ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => run(() => cancelGenerationAction(tenderId, generation.id))}
              variant="danger"
              size="sm"
            >
              Annuler
            </Button>
          ) : null}
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
