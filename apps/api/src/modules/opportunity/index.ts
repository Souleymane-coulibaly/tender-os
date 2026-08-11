export { OpportunityModule } from "./opportunity.module";

// V2 Sprint 9 (Chat IA conversationnel) — réexporté UNIQUEMENT pour le module `chat` : le dernier
// GO/NO-GO d'un Tender fait partie de la hiérarchie des sources structurées (mission §18), jamais
// recalculé par le Chat lui-même. Même motif de réexport ciblé que `tenders`/`client-portfolio`.
export { GetGoNoGoReportUseCase } from "./application/use-cases/get-go-no-go-report.use-case";
export type { GetGoNoGoReportQuery } from "./application/use-cases/get-go-no-go-report.use-case";
export type { GoNoGoReportRecord } from "./application/ports/go-no-go-report.repository";
export { GoNoGoReportNotFoundError } from "./domain/errors";

// V2 Sprint 15 (Dashboard opérationnel) — réexporté UNIQUEMENT pour `dashboard` : décompte
// GO/GO_CONDITIONAL/NO_GO sur une période, jamais transformé en taux de succès commercial (mission
// §26). Même motif de réexport ciblé que `GetGoNoGoReportUseCase` pour `chat` ci-dessus.
export { GetGoNoGoSummaryForDashboardUseCase } from "./application/use-cases/get-go-no-go-summary-for-dashboard.use-case";
export type { GetGoNoGoSummaryForDashboardQuery, GoNoGoSummaryForDashboard } from "./application/use-cases/get-go-no-go-summary-for-dashboard.use-case";
export { GoNoGoDecisionValue } from "./domain/go-no-go-decision";
