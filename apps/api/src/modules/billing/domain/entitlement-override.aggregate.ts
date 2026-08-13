import type { EntitlementFeature } from "./entitlement-feature";
import { EntitlementOverrideAlreadyRevokedError, InvalidEntitlementOverrideTargetError } from "./errors";
import type { QuotaLimit, QuotaType } from "./quota-type";

export type EntitlementOverrideProps = {
  id: string;
  organizationId: string;
  feature?: EntitlementFeature | undefined;
  featureEnabled?: boolean | undefined;
  quota?: QuotaType | undefined;
  quotaLimit?: QuotaLimit | undefined;
  reason: string;
  createdByPlatformAdministratorId: string;
  expiresAt?: Date | undefined;
  revokedAt?: Date | undefined;
  revokedByPlatformAdministratorId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-02) — dérogation Platform-Admin-only,
 * organisation-scopée, cible EXACTEMENT une feature (booléen) OU un quota (limite), jamais les
 * deux (mission §31/§37 : précédence claire "plan de base -> override -> entitlement effectif").
 * Ne modifie JAMAIS RBAC/ClientAccess (mission §39) : cet agrégat ne connaît que
 * organizationId/feature/quota, aucune notion de rôle, d'utilisateur métier ni de tenant Client.
 */
export class EntitlementOverride {
  private constructor(private props: EntitlementOverrideProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    feature?: EntitlementFeature | undefined;
    featureEnabled?: boolean | undefined;
    quota?: QuotaType | undefined;
    quotaLimit?: QuotaLimit | undefined;
    reason: string;
    createdByPlatformAdministratorId: string;
    expiresAt?: Date | undefined;
    occurredAt: Date;
  }): EntitlementOverride {
    const targetsFeature = input.feature !== undefined;
    const targetsQuota = input.quota !== undefined;
    if (targetsFeature === targetsQuota) {
      throw new InvalidEntitlementOverrideTargetError();
    }

    return new EntitlementOverride({
      id: input.id,
      organizationId: input.organizationId,
      feature: input.feature,
      featureEnabled: input.featureEnabled,
      quota: input.quota,
      quotaLimit: input.quotaLimit,
      reason: input.reason,
      createdByPlatformAdministratorId: input.createdByPlatformAdministratorId,
      expiresAt: input.expiresAt,
      revokedAt: undefined,
      revokedByPlatformAdministratorId: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static reconstitute(props: EntitlementOverrideProps): EntitlementOverride {
    return new EntitlementOverride(props);
  }

  revoke(input: { revokedByPlatformAdministratorId: string; occurredAt: Date }): void {
    if (this.props.revokedAt !== undefined) {
      throw new EntitlementOverrideAlreadyRevokedError(this.props.id);
    }
    this.props = { ...this.props, revokedAt: input.occurredAt, revokedByPlatformAdministratorId: input.revokedByPlatformAdministratorId, updatedAt: input.occurredAt };
  }

  isActive(now: Date): boolean {
    if (this.props.revokedAt !== undefined) {
      return false;
    }
    return this.props.expiresAt === undefined || this.props.expiresAt.getTime() > now.getTime();
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get feature(): EntitlementFeature | undefined {
    return this.props.feature;
  }

  get featureEnabled(): boolean | undefined {
    return this.props.featureEnabled;
  }

  get quota(): QuotaType | undefined {
    return this.props.quota;
  }

  get quotaLimit(): QuotaLimit | undefined {
    return this.props.quotaLimit;
  }

  toProps(): EntitlementOverrideProps {
    return { ...this.props };
  }
}
