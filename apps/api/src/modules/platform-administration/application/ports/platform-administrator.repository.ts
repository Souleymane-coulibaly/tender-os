import type { PlatformAdministrator } from "../../domain/platform-administrator.aggregate";

/**
 * `platform_administrators` — table dédiée, distincte de `organization_memberships`/`roles`
 * (mission : "N'ajoute pas ces rôles dans Memberships").
 */
export interface PlatformAdministratorRepository {
  findByUserId(userId: string): Promise<PlatformAdministrator | null>;
  countByRole(): Promise<Record<string, number>>;
  save(administrator: PlatformAdministrator): Promise<void>;
}

export const PLATFORM_ADMINISTRATOR_REPOSITORY = Symbol("PLATFORM_ADMINISTRATOR_REPOSITORY");
