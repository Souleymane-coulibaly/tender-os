export { MembershipsModule } from "./memberships.module";
export type { MembershipSummary } from "./application/dtos";
export { CountActiveMembersUseCase } from "./application/use-cases/count-active-members.use-case";
export { OrganizationMembershipGuard } from "./interfaces/http/organization-membership.guard";
export type { MembershipContext } from "./interfaces/http/organization-membership.guard";
export { CurrentMembershipContext } from "./interfaces/http/current-membership-context.decorator";

// V2 Sprint 7 (module `workspace`) — réexporté en LECTURE SEULE pour vérifier qu'un utilisateur
// candidat à l'affectation d'un Tender est bien membre ACTIF de l'organisation (`isEffectivelyActive`)
// et connaître son rôle organisationnel (mission §7) — même motif que `TENDER_REPOSITORY` déjà
// réexporté pour un usage système interne (Extraction), jamais une seconde logique de lookup
// dupliquée. Ne contourne aucune permission : l'autorisation réelle reste entièrement portée par
// `assertWorkspaceAccess`/`TenderPermission.ManageWorkspace`, ceci n'est qu'une vérification de
// validité de donnée.
export { MEMBERSHIP_REPOSITORY } from "./application/ports/membership.repository";
export type { MembershipRepository } from "./application/ports/membership.repository";
export { OrganizationMembership } from "./domain/organization-membership.aggregate";
