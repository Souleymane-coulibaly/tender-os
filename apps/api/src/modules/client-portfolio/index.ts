export { ClientPortfolioModule } from "./client-portfolio.module";

// Réexportés uniquement pour permettre à Tenders/Documents/Analysis/Knowledge Base de vérifier
// qu'un acteur a accès à un client donné avant d'agir sur une ressource qui lui appartient (mission
// Sprint 5.1 §"Policy d'accès client centralisée" — réutilisable, jamais recopiée dans un
// contrôleur) — même motif que le réexport de `GetTenderUseCase` par Tenders pour Documents.
export { AssertClientAccessUseCase } from "./application/use-cases/assert-client-access.use-case";
export type { AssertClientAccessQuery } from "./application/use-cases/assert-client-access.use-case";
export { ListAccessibleClientsUseCase } from "./application/use-cases/list-accessible-clients.use-case";
export type { ListAccessibleClientsQuery, ListAccessibleClientsResult } from "./application/use-cases/list-accessible-clients.use-case";
export { GetClientAccountUseCase } from "./application/use-cases/get-client-account.use-case";
export type { GetClientAccountQuery } from "./application/use-cases/get-client-account.use-case";
// V2 Sprint 2 — nécessaire à `company-profile`/`subcontractors` pour typer le retour de
// `GetClientAccountUseCase` sans dupliquer sa forme (mission "ne jamais dupliquer une donnée
// métier lorsqu'une référence suffit").
export type { ClientAccountSummary } from "./application/dtos";

export { ClientPermission, roleHasClientPortfolioPermission } from "./domain/client-permission";
// Réexporté pour permettre à Generation (Sprint 6) de typer sa "règle simple MEMBER" (validation)
// contre les vraies valeurs de rôle client, jamais des chaînes magiques dupliquées.
export { ClientRole, isClientRole } from "./domain/client-role";
export { ClientAccountStatus } from "./domain/client-account-status";
export {
  ClientAccountArchivedError,
  ClientAccountNotFoundError,
} from "./domain/errors";
