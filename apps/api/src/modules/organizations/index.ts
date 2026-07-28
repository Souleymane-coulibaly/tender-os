export { OrganizationsModule } from "./organizations.module";
export type { OrganizationSummary } from "./application/dtos";
// Réexportés uniquement pour que Memberships compose la création atomique Organization+OWNER
// et la suppression réservée à l'OWNER — voir organizations.module.ts.
export { CreateOrganizationUseCase } from "./application/use-cases/create-organization.use-case";
export type { CreateOrganizationCommand } from "./application/use-cases/create-organization.use-case";
export { DeleteOrganizationUseCase } from "./application/use-cases/delete-organization.use-case";
export type { DeleteOrganizationCommand } from "./application/use-cases/delete-organization.use-case";
export { GetOrganizationUseCase } from "./application/use-cases/get-organization.use-case";
export { ListOrganizationsUseCase } from "./application/use-cases/list-organizations.use-case";
export { SuspendOrganizationUseCase } from "./application/use-cases/suspend-organization.use-case";
export { ReactivateOrganizationUseCase } from "./application/use-cases/reactivate-organization.use-case";
export { CountOrganizationsByStatusUseCase } from "./application/use-cases/count-organizations-by-status.use-case";
export { OrganizationStatus } from "./domain/organization-status";
