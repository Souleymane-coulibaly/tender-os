import type { Metadata } from "next";
import { getCurrentMembershipRole, getCurrentUserId } from "../../../../../../lib/app-api-client";
import { fetchActivity, fetchApprovals, fetchParticipants, fetchTasks, fetchWorkspaceMembers } from "../../../../workspace-actions";
import type { ApprovalRequest, Task, TenderActivityPage, TenderParticipant } from "../../../../../../lib/workspace-types";
import { ApiErrorState } from "../../../api-error-state";
import { WorkspaceSection } from "./workspace-section";

export const metadata: Metadata = { title: "Workspace — TenderOS" };

export default async function TenderWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let participants: TenderParticipant[];
  let tasks: Task[];
  let approvals: ApprovalRequest[];
  let activity: TenderActivityPage;
  let members: { userId: string; email: string; displayName: string }[];
  let actorRole: string | undefined;
  let actorId: string | undefined;
  try {
    [participants, tasks, approvals, activity, members, actorRole, actorId] = await Promise.all([
      fetchParticipants(tenderId),
      fetchTasks(tenderId),
      fetchApprovals(tenderId),
      fetchActivity(tenderId),
      fetchWorkspaceMembers(tenderId),
      getCurrentMembershipRole(),
      getCurrentUserId(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Workspace collaboratif</h1>
        <p className="text-sm text-neutral-600">
          Qui travaille sur ce dossier, quelles tâches restent à faire, quelles validations sont en attente — un score
          de complétude Workspace distinct du GO/NO-GO (Sprint 5) et de la checklist (Sprint 6), jamais recalculé
          automatiquement.
        </p>
      </div>
      <WorkspaceSection
        tenderId={tenderId}
        initialParticipants={participants}
        initialTasks={tasks}
        initialApprovals={approvals}
        initialActivity={activity}
        members={members}
        actorRole={actorRole}
        actorId={actorId}
      />
    </div>
  );
}
