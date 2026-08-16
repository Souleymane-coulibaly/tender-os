export { WorkspaceModule } from "./workspace.module";

// V2 Sprint 15 (Dashboard opérationnel) — réexportés UNIQUEMENT pour `dashboard` : "Mes tâches"
// (déjà scopé ClientAccess, mission §37/§38 "Mes tâches ≠ toutes les tâches") et le flux d'activité
// portfolio en LECTURE SEULE, jamais un second moteur Task/Activity dupliqué. Premier consommateur
// externe de ce module (aucun barrel n'existait avant ce sprint) — même motif de réexport ciblé que
// `response-package`/`opportunity` pour `chat` (Sprint 9).
export { GetMyTasksUseCase } from "./application/use-cases/get-my-tasks.use-case";
export type { GetMyTasksQuery } from "./application/use-cases/get-my-tasks.use-case";
export type { TaskSummary } from "./application/dtos";
export { TaskStatus, TaskPriority } from "./domain/task.entity";
export { ListRecentActivityForDashboardUseCase } from "./application/use-cases/list-recent-activity-for-dashboard.use-case";
export type { ListRecentActivityForDashboardQuery } from "./application/use-cases/list-recent-activity-for-dashboard.use-case";
export type { TenderActivityRecord } from "./application/ports/tender-activity.repository";
export { TenderActivityType } from "./domain/tender-activity-type";

// V2 Sprint 18 (mission §66-68 "Dashboard peut afficher Validations en attente : N") — même motif
// de réexport ciblé que ci-dessus, jamais un second calcul de ClientAccess/périmètre.
export { ListMyApprovalsUseCase } from "./application/use-cases/list-my-approvals.use-case";
export type { ListMyApprovalsQuery } from "./application/use-cases/list-my-approvals.use-case";
export type { ApprovalRequestSummary } from "./application/dtos";

// V2 Sprint 25 (Dashboard Premium) — mission §25.59 "Dossiers prioritaires... responsables" : même
// motif de réexport ciblé que ci-dessus, jamais un second modèle de participants dupliqué pour le
// Dashboard. `ListTenderParticipantsUseCase` reste par-Tender (aucune méthode batch dans le port) —
// le Dashboard l'appelle une fois par dossier prioritaire affiché (liste déjà bornée à quelques
// éléments), même discipline N-appels que `ListWorkspaceMembersUseCase`/`ListOrganizationMembersUseCase`
// pour résoudre des noms d'utilisateur (aucune méthode batch `findByIds` n'existe non plus côté Identity).
export { ListTenderParticipantsUseCase } from "./application/use-cases/list-tender-participants.use-case";
export type { ListTenderParticipantsQuery } from "./application/use-cases/list-tender-participants.use-case";
export type { TenderParticipantSummary } from "./application/dtos";
