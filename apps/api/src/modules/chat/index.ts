export { ChatModule } from "./chat.module";

// Réexporté en LECTURE SEULE pour Sprint 22 (module `billing`, étape 22D) — mesure d'usage "Chat
// IA" organisation-wide (écran Abonnement & utilisation, Platform Admin, résumé Dashboard 22E).
// Même motif que les use cases "for-dashboard" déjà réexportés par Tenders/ResponsePackage/
// Opportunity/Workspace (Sprint 15) : jamais un accès Prisma cross-module direct.
export { CountTodayChatUsageForOrganizationUseCase } from "./application/use-cases/count-today-chat-usage-for-organization.use-case";
