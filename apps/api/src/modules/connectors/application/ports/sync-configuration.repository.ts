import type { SyncConfiguration } from "../../domain/sync-configuration.entity";

export interface SyncConfigurationRepository {
  findById(input: { organizationId: string; syncConfigurationId: string }): Promise<SyncConfiguration | null>;
  listByOrganization(input: { organizationId: string }): Promise<readonly SyncConfiguration[]>;
  save(config: SyncConfiguration): Promise<void>;
}

export const SYNC_CONFIGURATION_REPOSITORY = Symbol("SYNC_CONFIGURATION_REPOSITORY");
