import { Inject, Injectable } from "@nestjs/common";
import { UpdateOrganizationUseCase, type OrganizationSettings, type OrganizationSummary } from "../../../organizations";
import { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type UpdateOrganizationProfileCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: OrganizationRole;
  name?: string | undefined;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency?: string | undefined;
  defaultTimezone?: string | undefined;
  settings?: OrganizationSettings | undefined;
  requestId?: string | undefined;
}>;

export type UpdateOrganizationProfileResult = OrganizationSummary;

/**
 * IDOR corrigé (V2 Sprint 24) — `PATCH /organizations/me` exige `organization:profile:update`
 * (OWNER/ORGANIZATION_ADMIN uniquement) en plus de l'appartenance vérifiée par
 * `OrganizationMembershipGuard`. Le contrôle vit ici (Memberships, où `OrganizationRole`/
 * `OrganizationPermission` sont définis) plutôt que dans `UpdateOrganizationUseCase`
 * (Organizations), qui ne doit pas dépendre de Memberships — même motif que
 * `DeleteOrganizationAsOwnerUseCase`.
 */
@Injectable()
export class UpdateOrganizationProfileUseCase {
  constructor(
    private readonly updateOrganizationUseCase: UpdateOrganizationUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateOrganizationProfileCommand): Promise<UpdateOrganizationProfileResult> {
    assertHasPermission(command.actorRole, OrganizationPermission.ProfileUpdate);

    const result = await this.updateOrganizationUseCase.execute({
      id: command.organizationId,
      name: command.name,
      legalName: command.legalName,
      registrationNumber: command.registrationNumber,
      countryCode: command.countryCode,
      defaultCurrency: command.defaultCurrency,
      defaultTimezone: command.defaultTimezone,
      settings: command.settings,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization.profile.updated",
      resourceId: command.organizationId,
      requestId: command.requestId,
    });

    return result;
  }
}
