import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import { EntitlementOverrideReasonRequiredError } from "../../domain/errors";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import { EntitlementOverride } from "../../domain/entitlement-override.aggregate";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ENTITLEMENT_OVERRIDE_REPOSITORY, type EntitlementOverrideRepository } from "../ports/entitlement-override.repository";

export type CreateEntitlementOverrideCommand = Readonly<{
  organizationId: string;
  feature?: EntitlementFeature | undefined;
  featureEnabled?: boolean | undefined;
  quota?: QuotaType | undefined;
  quotaLimit?: QuotaLimit | undefined;
  reason: string;
  expiresAt?: Date | undefined;
  actorPlatformAdministratorId: string;
  actorPlatformRole: PlatformRole;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-02) — Platform Admin only (mission
 * §32 "POINT BLOQUANT"), jamais accessible à un Organization Admin/Owner (structurellement bloqués
 * en amont par `PlatformAccessGuard` — aucun `PlatformAdministrator` pour eux — puis ici par
 * `assertHasCapability`, SUPPORT compris : lecture seule). Mission §53 : au plus un override actif
 * par cible (organizationId, feature) ou (organizationId, quota) — un nouvel override supersède
 * automatiquement (révoque) l'override actif précédent sur la MÊME cible, jamais deux overrides
 * contradictoires actifs simultanément.
 */
@Injectable()
export class CreateEntitlementOverrideUseCase {
  constructor(
    @Inject(ENTITLEMENT_OVERRIDE_REPOSITORY) private readonly overrideRepository: EntitlementOverrideRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateEntitlementOverrideCommand): Promise<EntitlementOverride> {
    assertHasCapability(command.actorPlatformRole, PlatformCapability.EntitlementOverridesManage);

    if (command.reason.trim().length === 0) {
      throw new EntitlementOverrideReasonRequiredError();
    }

    const previousActive = command.feature
      ? await this.overrideRepository.findActiveFeatureOverride(command.organizationId, command.feature, command.occurredAt)
      : command.quota
        ? await this.overrideRepository.findActiveQuotaOverride(command.organizationId, command.quota, command.occurredAt)
        : null;

    if (previousActive) {
      previousActive.revoke({ revokedByPlatformAdministratorId: command.actorPlatformAdministratorId, occurredAt: command.occurredAt });
      await this.overrideRepository.save(previousActive);
    }

    const override = EntitlementOverride.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      feature: command.feature,
      featureEnabled: command.featureEnabled,
      quota: command.quota,
      quotaLimit: command.quotaLimit,
      reason: command.reason,
      createdByPlatformAdministratorId: command.actorPlatformAdministratorId,
      expiresAt: command.expiresAt,
      occurredAt: command.occurredAt,
    });
    await this.overrideRepository.save(override);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorPlatformAdministratorId,
      action: "EntitlementOverrideChanged",
      resourceType: "EntitlementOverride",
      resourceId: override.id,
      metadata: {
        feature: command.feature,
        featureEnabled: command.featureEnabled,
        quota: command.quota,
        quotaLimit: command.quotaLimit,
        reason: command.reason,
        expiresAt: command.expiresAt?.toISOString(),
        supersededOverrideId: previousActive?.id,
      },
    });

    return override;
  }
}
