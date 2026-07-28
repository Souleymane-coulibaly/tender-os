import { Inject, Injectable } from "@nestjs/common";
import { DeleteOrganizationUseCase } from "../../../organizations";
import { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type DeleteOrganizationAsOwnerCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: OrganizationRole;
  requestId?: string | undefined;
}>;

/**
 * BR-ORG-002 — la suppression d'une organisation est réservée à son OWNER. Le contrôle vit ici
 * (Memberships, où `OrganizationRole`/`OrganizationPermission` sont définis) plutôt que dans
 * `DeleteOrganizationUseCase` (Organizations), qui ne doit pas dépendre de Memberships.
 */
@Injectable()
export class DeleteOrganizationAsOwnerUseCase {
  constructor(
    private readonly deleteOrganizationUseCase: DeleteOrganizationUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: DeleteOrganizationAsOwnerCommand): Promise<void> {
    assertHasPermission(command.actorRole, OrganizationPermission.OrganizationDelete);

    await this.deleteOrganizationUseCase.execute({ id: command.organizationId });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization.deleted",
      resourceId: command.organizationId,
      requestId: command.requestId,
    });
  }
}
