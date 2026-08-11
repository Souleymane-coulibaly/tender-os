export { ResponsePackageModule } from "./response-package.module";

// V2 Sprint 15 (Dashboard opérationnel) — réexporté UNIQUEMENT pour `dashboard` : le statut
// dénormalisé (`ResponsePackage.status`) déjà éprouvé par Sprint 14, jamais un second calcul de
// readiness (mission §64/§115). Premier export de ce module (voir response-package.module.ts).
export { GetResponsePackagePortfolioSummaryForDashboardUseCase } from "./application/use-cases/get-response-package-portfolio-summary-for-dashboard.use-case";
export type { GetResponsePackagePortfolioSummaryForDashboardQuery } from "./application/use-cases/get-response-package-portfolio-summary-for-dashboard.use-case";
export type { ResponsePackageDashboardRow } from "./application/ports/response-package.repository";
export { ResponsePackageStatus } from "./domain/enums";

// V2 Sprint 16 (Integration Hub) — réexporté UNIQUEMENT pour `integrations` (Public API en
// lecture seule, mission §85/§86), même motif que ci-dessus pour `dashboard`.
export { GetResponsePackageForPublicApiUseCase } from "./application/use-cases/get-response-package-for-public-api.use-case";
export type { GetResponsePackageForPublicApiQuery, ResponsePackagePublicSummary } from "./application/use-cases/get-response-package-for-public-api.use-case";
