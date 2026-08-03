export { DeliverablesModule } from "./deliverables.module";

// Pont `@Global()` Sprint 8A.2 (correction bugs #7/#8 "thème non appliqué à l'export") — DOIT être
// importé par `AppModule` aux côtés de `DeliverablesModule`, sinon Export ne peut jamais résoudre
// de thème (voir infrastructure/export-theme-resolver-bridge.module.ts).
export { ExportThemeResolverBridgeModule } from "./infrastructure/export-theme-resolver-bridge.module";

// Réexporté en LECTURE SEULE pour Sprint 8A.2 (module `cockpit`) — les 9 livrables et leur statut
// respectif pour la vue d'ensemble, jamais un second calcul du statut dérivé.
export { ListDeliverablesUseCase } from "./application/use-cases/list-deliverables.use-case";
export type { ListDeliverablesQuery } from "./application/use-cases/list-deliverables.use-case";
export type { DeliverableSummary } from "./application/dtos";
export { DeliverableStatus } from "./domain/deliverable-status";
