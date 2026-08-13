export { PlatformAdministrationModule } from "./platform-administration.module";

// V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-02) — réexporté UNIQUEMENT pour que
// `billing` protège ses endpoints d'overrides d'entitlement par le mécanisme Platform Admin
// existant, jamais une seconde implémentation. Même motif de réexport ciblé que
// `identity`/`AuthenticatedGuard`.
export { PlatformAccessGuard } from "./interfaces/http/platform-access.guard";
export { CurrentPlatformContext } from "./interfaces/http/current-platform-context.decorator";
export type { PlatformContext } from "./interfaces/http/platform-access.guard";
export { PlatformCapability, roleHasCapability } from "./domain/platform-capability";
export { assertHasCapability } from "./application/policies/platform-authorization.policy";
export { PlatformRole } from "./domain/platform-role";
