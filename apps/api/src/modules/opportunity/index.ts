export { OpportunityModule } from "./opportunity.module";

// V2 Sprint 9 (Chat IA conversationnel) — réexporté UNIQUEMENT pour le module `chat` : le dernier
// GO/NO-GO d'un Tender fait partie de la hiérarchie des sources structurées (mission §18), jamais
// recalculé par le Chat lui-même. Même motif de réexport ciblé que `tenders`/`client-portfolio`.
export { GetGoNoGoReportUseCase } from "./application/use-cases/get-go-no-go-report.use-case";
export type { GetGoNoGoReportQuery } from "./application/use-cases/get-go-no-go-report.use-case";
export type { GoNoGoReportRecord } from "./application/ports/go-no-go-report.repository";
export { GoNoGoReportNotFoundError } from "./domain/errors";
