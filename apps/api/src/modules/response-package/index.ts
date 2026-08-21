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

// V2 Sprint 18 — réexporté UNIQUEMENT pour `workspace` (validation d'une cible ApprovalRequest
// RESPONSE_PACKAGE_VERSION : appartenance au Tender + statut VALIDATED requis), même motif que
// ci-dessus.
export { GetVersionTenderRefForApprovalUseCase } from "./application/use-cases/get-version-tender-ref-for-approval.use-case";
export type { ResponsePackageVersionTenderRef } from "./application/use-cases/get-version-tender-ref-for-approval.use-case";
export { ResponsePackageVersionStatus } from "./domain/enums";

// Checkpoint 2.1-P2.1-FIX-F — réexportés pour `submission` (agrégateur final de readiness).
export { ListResponsePackagesUseCase } from "./application/use-cases/list-response-packages.use-case";
export type { ListResponsePackagesQuery } from "./application/use-cases/list-response-packages.use-case";
export { GetResponsePackageFreshnessUseCase } from "./application/use-cases/get-response-package-freshness.use-case";
export type { ResponsePackageFreshnessResult } from "./application/use-cases/get-response-package-freshness.use-case";
export { ResponsePackageFreshness } from "./domain/response-package-freshness";

// Checkpoint TENDEROS-2.1-P2.2-F2 — réexporté pour `submission` (résolution du dossier de réponse
// V2 réellement soumissible, mission §6), même motif que les exports FIX-F ci-dessus.
export { GetSubmittableResponsePackageVersionUseCase } from "./application/use-cases/get-submittable-response-package-version.use-case";
export type { SubmittableResponsePackageVersion, SubmittableResponsePackageVersionForLot, SubmittableResponsePackageVersionResolution } from "./application/use-cases/get-submittable-response-package-version.use-case";

// Checkpoint TENDEROS-2.1-P2.2-F2.3 — réexporté pour `submission` (SOT du périmètre de lots requis
// pour candidature, mission §3), même motif que les exports F2 ci-dessus.
export { GetRequiredResponsePackagesForTenderUseCase } from "./application/use-cases/get-required-response-packages-for-tender.use-case";
export type { ResponsePackageRequirement } from "./domain/services/resolve-response-package-requirements";
