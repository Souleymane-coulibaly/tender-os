"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addParticipantAction,
  approveApprovalAction,
  assignTaskAction,
  changeTaskStatusAction,
  createCommentAction,
  createTaskAction,
  fetchComments,
  rejectApprovalAction,
  removeParticipantAction,
  requestApprovalAction,
  requestApprovalChangesAction,
} from "../../../../workspace-actions";
import { EntitlementUpgradeNotice } from "../../../entitlement-upgrade-notice";
import {
  APPROVAL_ENTITY_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TENDER_COLLABORATIVE_ROLE_LABELS,
  canManageWorkspace,
  canValidateWorkspaceOrgTier,
  type ApprovalRequest,
  type Comment,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TenderActivityPage,
  type TenderCollaborativeRole,
  type TenderParticipant,
} from "../../../../../../lib/workspace-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";

type Member = { userId: string; email: string; displayName: string };

const ROLES: TenderCollaborativeRole[] = [
  "TENDER_MANAGER",
  "ADMINISTRATIVE_RESPONSIBLE",
  "TECHNICAL_WRITER",
  "FINANCIAL_RESPONSIBLE",
  "REVIEWER",
  "SIGNATORY",
  "VIEWER",
];
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"];
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function useMemberNames(members: Member[]) {
  const byId = new Map(members.map((m) => [m.userId, m]));
  return (userId: string | undefined): string => {
    if (!userId) return "—";
    const member = byId.get(userId);
    return member ? member.displayName : userId;
  };
}

function SummaryHeader({
  participants,
  tasks,
  approvals,
}: {
  participants: TenderParticipant[];
  tasks: Task[];
  approvals: ApprovalRequest[];
}) {
  const todo = tasks.filter((t) => t.status === "TODO").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const inReview = tasks.filter((t) => t.status === "IN_REVIEW").length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const now = Date.now();
  const dueSoon = tasks.filter(
    (t) =>
      t.dueDate &&
      !["DONE", "CANCELLED"].includes(t.status) &&
      new Date(t.dueDate).getTime() - now < 3 * 24 * 60 * 60 * 1000,
  ).length;
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING").length;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded border border-tenderos-navy/10 bg-tenderos-light p-3 text-xs text-tenderos-navy">
      <span className="font-semibold text-tenderos-navy">
        Équipe : {participants.length} membre(s)
      </span>
      <span>Tâches : {tasks.length}</span>
      <span>À faire : {todo}</span>
      <span>En cours : {inProgress}</span>
      <span>En relecture : {inReview}</span>
      <span>Terminées : {done}</span>
      {dueSoon > 0 ? (
        <span className="font-medium text-warning-fg">{dueSoon} échéance(s) proche(s)</span>
      ) : null}
      {pendingApprovals > 0 ? (
        <span className="font-medium text-tenderos-blue">
          {pendingApprovals} validation(s) en attente
        </span>
      ) : null}
    </div>
  );
}

function ParticipantsPanel({
  tenderId,
  participants,
  members,
  canManage,
  getName,
}: {
  tenderId: string;
  participants: TenderParticipant[];
  members: Member[];
  canManage: boolean;
  getName: (id: string | undefined) => string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  const activeUserIds = new Set(participants.map((p) => p.userId));
  const candidates = members.filter((m) => !activeUserIds.has(m.userId));

  return (
    <section className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <h2 className="text-sm font-semibold text-tenderos-navy">Équipe</h2>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {participants.map((participant) => (
          <li
            key={participant.id}
            className="flex items-center justify-between gap-2 border-b border-tenderos-navy/10 py-1.5 text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium text-tenderos-navy">{getName(participant.userId)}</span>
              <span className="text-xs text-tenderos-slate">
                {TENDER_COLLABORATIVE_ROLE_LABELS[participant.role]}
              </span>
            </div>
            {canManage ? (
              <Button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await removeParticipantAction(tenderId, participant.id);
                  setIsPending(false);
                  setError(result.error);
                  if (!result.error) router.refresh();
                }}
                variant="secondary"
                size="sm"
              >
                Retirer
              </Button>
            ) : null}
          </li>
        ))}
        {participants.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun participant pour l&apos;instant.</p>
        ) : null}
      </ul>
      {canManage && candidates.length > 0 ? (
        <form
          action={async (formData: FormData) => {
            setIsPending(true);
            setError(undefined);
            const result = await addParticipantAction(tenderId, {
              userId: String(formData.get("userId")),
              role: formData.get("role") as TenderCollaborativeRole,
            });
            setIsPending(false);
            setError(result.error);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Select name="userId" required>
            {candidates.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName} ({member.email})
              </option>
            ))}
          </Select>
          <Select name="role" defaultValue="TECHNICAL_WRITER">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {TENDER_COLLABORATIVE_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={isPending} variant="secondary" size="sm">
            Ajouter
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function TaskRow({
  tenderId,
  task,
  participants,
  canManage,
  getName,
}: {
  tenderId: string;
  task: Task;
  participants: TenderParticipant[];
  canManage: boolean;
  getName: (id: string | undefined) => string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState(task.status);
  const [showComment, setShowComment] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [mentionedUserId, setMentionedUserId] = useState("");
  const [comments, setComments] = useState<Comment[] | undefined>();

  return (
    <li className="flex flex-col gap-1.5 border-b border-tenderos-navy/10 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-tenderos-navy">{task.title}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-tenderos-slate">
            <span className="rounded bg-tenderos-light px-1.5 py-0.5">
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            <span>Responsable : {getName(task.assigneeId)}</span>
            {task.dueDate ? (
              <span>Échéance : {new Date(task.dueDate).toLocaleDateString("fr-FR")}</span>
            ) : null}
            {task.checklistItemId ? (
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">
                Depuis la checklist
              </span>
            ) : null}
          </div>
        </div>
        <Select
          aria-label="Statut de la tâche"
          value={status}
          disabled={isPending || !canManage}
          onChange={async (event) => {
            const nextStatus = event.target.value as TaskStatus;
            setIsPending(true);
            setStatus(nextStatus);
            const result = await changeTaskStatusAction(tenderId, task.id, nextStatus);
            setIsPending(false);
            setError(result.error);
            if (!result.error) router.refresh();
          }}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {TASK_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Responsable de la tâche"
            defaultValue={task.assigneeId ?? ""}
            disabled={isPending}
            onChange={async (event) => {
              setIsPending(true);
              const result = await assignTaskAction(
                tenderId,
                task.id,
                event.target.value || undefined,
              );
              setIsPending(false);
              setError(result.error);
              if (!result.error) router.refresh();
            }}
          >
            <option value="">Non assignée</option>
            {participants.map((participant) => (
              <option key={participant.userId} value={participant.userId}>
                {getName(participant.userId)}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            onClick={async () => {
              const next = !showComment;
              setShowComment(next);
              if (next && comments === undefined) {
                setComments(await fetchComments(tenderId, "TASK", task.id));
              }
            }}
            variant="secondary"
            size="sm"
          >
            Commenter
          </Button>
        </div>
      ) : null}
      {showComment ? (
        <div className="flex flex-col gap-1.5 rounded border border-tenderos-navy/10 bg-tenderos-light p-2">
          {comments && comments.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {comments.map((comment) => (
                <li key={comment.id} className="text-xs text-tenderos-navy">
                  <span className="font-medium text-tenderos-navy">
                    {getName(comment.authorId)}
                  </span>{" "}
                  — {comment.body}
                  {comment.mentionedUserIds.length > 0 ? (
                    <span className="ml-1 text-purple-700">
                      {comment.mentionedUserIds.map((id) => `@${getName(id)}`).join(" ")}
                    </span>
                  ) : null}
                  <span className="ml-1 text-tenderos-slate">
                    {new Date(comment.createdAt).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tenderos-slate">Aucun commentaire pour l&apos;instant.</p>
          )}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsPending(true);
              const result = await createCommentAction(tenderId, {
                entityType: "TASK",
                entityId: task.id,
                body: commentBody,
                ...(mentionedUserId ? { mentionedUserIds: [mentionedUserId] } : {}),
              });
              setIsPending(false);
              setError(result.error);
              if (!result.error) {
                setComments(await fetchComments(tenderId, "TASK", task.id));
                setCommentBody("");
                setMentionedUserId("");
              }
            }}
          >
            <Input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Nouveau commentaire..."
              className="flex-1"
            />
            {/* Mentionne uniquement un participant réel de ce Tender — jamais un texte libre "@Jean"
                (mission §22/§23). Le backend revalide et refuse la mention ENTIÈRE du commentaire si
                la personne n'est plus autorisée entre-temps. */}
            <Select
              aria-label="Mentionner un participant"
              value={mentionedUserId}
              onChange={(event) => setMentionedUserId(event.target.value)}
            >
              <option value="">Mentionner (optionnel)</option>
              {participants.map((participant) => (
                <option key={participant.userId} value={participant.userId}>
                  @{getName(participant.userId)}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              disabled={isPending || commentBody.trim().length === 0}
              variant="secondary"
              size="sm"
            >
              Envoyer
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

function TasksPanel({
  tenderId,
  tasks,
  participants,
  canManage,
  getName,
}: {
  tenderId: string;
  tasks: Task[];
  participants: TenderParticipant[];
  canManage: boolean;
  getName: (id: string | undefined) => string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | TaskStatus>("ALL");

  const filteredTasks = filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <section className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tenderos-navy">Tâches</h2>
        <label className="flex items-center gap-1 text-xs text-tenderos-slate">
          Filtrer
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "ALL" | TaskStatus)}
          >
            <option value="ALL">Toutes</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      {filteredTasks.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune tâche.</p>
      ) : (
        <ul>
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              tenderId={tenderId}
              task={task}
              participants={participants}
              canManage={canManage}
              getName={getName}
            />
          ))}
        </ul>
      )}
      {canManage ? (
        <form
          action={async (formData: FormData) => {
            setIsPending(true);
            setError(undefined);
            const assigneeId = (formData.get("assigneeId") as string) || "";
            const result = await createTaskAction(tenderId, {
              title: String(formData.get("title")),
              priority: formData.get("priority") as TaskPriority,
              ...(assigneeId ? { assigneeId } : {}),
            });
            setIsPending(false);
            setError(result.error);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Input name="title" required placeholder="Nouvelle tâche..." />
          <Select name="priority" defaultValue="MEDIUM">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
          <Select name="assigneeId" defaultValue="">
            <option value="">Non assignée</option>
            {participants.map((participant) => (
              <option key={participant.userId} value={participant.userId}>
                {getName(participant.userId)}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={isPending} variant="secondary" size="sm">
            Ajouter
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function approvalStatusBadgeClass(status: ApprovalRequest["status"]): string {
  switch (status) {
    case "APPROVED":
      return "bg-success-bg text-success-fg";
    case "REJECTED":
      return "bg-danger-bg text-danger-fg";
    case "CHANGES_REQUESTED":
      return "bg-warning-bg text-warning-fg";
    case "CANCELLED":
      return "bg-tenderos-light text-tenderos-slate";
    default:
      return "bg-info-bg text-info-fg";
  }
}

function ApprovalsPanel({
  tenderId,
  approvals,
  tasks,
  participants,
  actorId,
  canValidate,
  hasApprovalWorkflowsEntitlement,
  getName,
}: {
  tenderId: string;
  approvals: ApprovalRequest[];
  tasks: Task[];
  participants: TenderParticipant[];
  actorId: string | undefined;
  canValidate: boolean;
  /** Checkpoint TENDEROS-2.1-P2.3-E1 — `EntitlementFeature.ApprovalWorkflows` (backend gate réel,
   *  `RequestApprovalUseCase`) : jamais dupliqué ici, uniquement affiché. */
  hasApprovalWorkflowsEntitlement: boolean;
  getName: (id: string | undefined) => string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | undefined>();
  const [rejectReason, setRejectReason] = useState("");

  return (
    <section className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <h2 className="text-sm font-semibold text-tenderos-navy">Validations</h2>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      {approvals.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune demande de validation.</p>
      ) : (
        <ul>
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="flex flex-col gap-1 border-b border-tenderos-navy/10 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
                  {APPROVAL_ENTITY_TYPE_LABELS[approval.entityType]}
                </span>
                <span className="text-xs text-tenderos-slate">
                  Demandé par {getName(approval.requestedBy)} — Approbateur :{" "}
                  {getName(approval.reviewerId)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${approvalStatusBadgeClass(approval.status)}`}
                >
                  {APPROVAL_STATUS_LABELS[approval.status]}
                </span>
              </div>
              {approval.comment ? (
                <p className="text-xs italic text-tenderos-slate">{approval.comment}</p>
              ) : null}
              {/* Jamais présenté comme "signé" — validation interne uniquement (mission §47). */}
              {approval.status === "PENDING" && canValidate && approval.reviewerId === actorId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={async () => {
                      setIsPending(true);
                      const result = await approveApprovalAction(tenderId, approval.id);
                      setIsPending(false);
                      setError(result.error);
                      if (!result.error) router.refresh();
                    }}
                    variant="primary"
                    size="sm"
                  >
                    Valider
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={async () => {
                      setIsPending(true);
                      const result = await requestApprovalChangesAction(tenderId, approval.id);
                      setIsPending(false);
                      setError(result.error);
                      if (!result.error) router.refresh();
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Demander des modifications
                  </Button>
                  {rejectingId === approval.id ? (
                    <>
                      <Input
                        aria-label="Raison du rejet"
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Raison du rejet (obligatoire)"
                        className="border-red-300"
                      />
                      <Button
                        type="button"
                        disabled={isPending || rejectReason.trim().length === 0}
                        onClick={async () => {
                          setIsPending(true);
                          const result = await rejectApprovalAction(
                            tenderId,
                            approval.id,
                            rejectReason,
                          );
                          setIsPending(false);
                          setError(result.error);
                          if (!result.error) {
                            setRejectingId(undefined);
                            setRejectReason("");
                            router.refresh();
                          }
                        }}
                        variant="danger"
                        size="sm"
                      >
                        Confirmer le rejet
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => setRejectingId(approval.id)}
                      variant="danger"
                      size="sm"
                    >
                      Rejeter
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {hasApprovalWorkflowsEntitlement ? (
        <RequestApprovalForm
          tenderId={tenderId}
          tasks={tasks}
          participants={participants}
          getName={getName}
          onError={setError}
          setPending={setIsPending}
          isPending={isPending}
        />
      ) : (
        <EntitlementUpgradeNotice featureLabel="Les workflows de validation" />
      )}
    </section>
  );
}

function RequestApprovalForm({
  tenderId,
  tasks,
  participants,
  getName,
  onError,
  setPending,
  isPending,
}: {
  tenderId: string;
  tasks: Task[];
  participants: TenderParticipant[];
  getName: (id: string | undefined) => string;
  onError: (error: string | undefined) => void;
  setPending: (pending: boolean) => void;
  isPending: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <p className="text-xs text-tenderos-slate">
        Aucune tâche à soumettre à validation pour l&apos;instant.
      </p>
    );
  }

  return (
    <form
      action={async (formData: FormData) => {
        setPending(true);
        onError(undefined);
        const result = await requestApprovalAction(tenderId, {
          entityType: "TASK",
          entityId: String(formData.get("entityId")),
          reviewerId: String(formData.get("reviewerId")),
        });
        setPending(false);
        onError(result.error);
      }}
      className="flex flex-wrap items-end gap-2"
    >
      {/* Sélection par titre, jamais un identifiant technique saisi à la main — cohérent avec le
          reste du Workspace (mission "toujours privilégier la simplicité"). */}
      <Select name="entityId" required>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </Select>
      <Select name="reviewerId" required>
        {participants.map((participant) => (
          <option key={participant.userId} value={participant.userId}>
            {getName(participant.userId)}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={isPending} variant="secondary" size="sm">
        Demander une validation
      </Button>
    </form>
  );
}

function ActivityPanel({
  activity,
  getName,
}: {
  activity: TenderActivityPage;
  getName: (id: string | undefined) => string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <h2 className="text-sm font-semibold text-tenderos-navy">Activité récente</h2>
      {activity.items.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune activité pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {activity.items.map((item) => (
            <li
              key={item.id}
              className="border-b border-tenderos-navy/10 py-1.5 text-xs text-tenderos-navy"
            >
              <span className="font-medium text-tenderos-navy">{getName(item.actorId)}</span> —{" "}
              {item.summary}{" "}
              <span className="text-tenderos-slate">
                {new Date(item.createdAt).toLocaleString("fr-FR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkspaceSection({
  tenderId,
  initialParticipants,
  initialTasks,
  initialApprovals,
  initialActivity,
  members,
  actorRole,
  actorId,
  hasApprovalWorkflowsEntitlement,
}: {
  tenderId: string;
  initialParticipants: TenderParticipant[];
  initialTasks: Task[];
  initialApprovals: ApprovalRequest[];
  initialActivity: TenderActivityPage;
  members: Member[];
  actorRole: string | undefined;
  actorId: string | undefined;
  /** Checkpoint TENDEROS-2.1-P2.3-E1 — `EntitlementFeature.ApprovalWorkflows` (backend gate réel,
   *  `RequestApprovalUseCase`) : jamais dupliqué ici, uniquement affiché. */
  hasApprovalWorkflowsEntitlement: boolean;
}) {
  const getName = useMemberNames(members);
  const canManage = canManageWorkspace(actorRole);
  const canValidate = canValidateWorkspaceOrgTier(actorRole);

  return (
    <div className="flex flex-col gap-4">
      <SummaryHeader
        participants={initialParticipants}
        tasks={initialTasks}
        approvals={initialApprovals}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ParticipantsPanel
          tenderId={tenderId}
          participants={initialParticipants}
          members={members}
          canManage={canManage}
          getName={getName}
        />
        <ApprovalsPanel
          tenderId={tenderId}
          approvals={initialApprovals}
          tasks={initialTasks}
          participants={initialParticipants}
          actorId={actorId}
          canValidate={canValidate}
          hasApprovalWorkflowsEntitlement={hasApprovalWorkflowsEntitlement}
          getName={getName}
        />
      </div>
      <TasksPanel
        tenderId={tenderId}
        tasks={initialTasks}
        participants={initialParticipants}
        canManage={canManage}
        getName={getName}
      />
      <ActivityPanel activity={initialActivity} getName={getName} />
    </div>
  );
}
