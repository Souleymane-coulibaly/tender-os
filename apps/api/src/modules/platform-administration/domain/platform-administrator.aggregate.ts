import { PlatformAdministratorId } from "./platform-administrator-id.value-object";
import type { PlatformRole } from "./platform-role";

export type PlatformAdministratorProps = {
  id: PlatformAdministratorId;
  userId: string;
  role: PlatformRole;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Identité d'administration plateforme — distincte de toute Membership d'organisation
 * (mission Platform Administration : "N'ajoute pas ces rôles dans Memberships"). Référence
 * `userId` uniquement (le compte TenderOS reste possédé par Identity).
 */
export class PlatformAdministrator {
  private constructor(private props: PlatformAdministratorProps) {}

  static create(input: {
    id: PlatformAdministratorId;
    userId: string;
    role: PlatformRole;
    occurredAt: Date;
  }): PlatformAdministrator {
    return new PlatformAdministrator({
      id: input.id,
      userId: input.userId,
      role: input.role,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PlatformAdministratorProps): PlatformAdministrator {
    return new PlatformAdministrator(props);
  }

  get id(): PlatformAdministratorId {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get role(): PlatformRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
