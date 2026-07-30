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

export { ClientPermission } from "./domain/client-permission";
export { ClientAccountStatus } from "./domain/client-account-status";
export {
  ClientAccountArchivedError,
  ClientAccountNotFoundError,
} from "./domain/errors";
