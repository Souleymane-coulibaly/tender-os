import type { CalendarSyncedEvent } from "../domain/calendar-synced-event.entity";
import type { ConnectorProvider } from "../domain/enums";
import type { ExternalConnection } from "../domain/external-connection.entity";
import type { OAuthFlowState } from "../domain/oauth-flow-state.entity";
import type { SyncConfiguration } from "../domain/sync-configuration.entity";
import { ConnectionStatus } from "../domain/enums";
import type { AuditLogWriter, ConnectorAuditLogEntry } from "../application/ports/audit-log-writer";
import type { CalendarSyncedEventRepository } from "../application/ports/calendar-synced-event.repository";
import type { CredentialCipher } from "../application/ports/credential-cipher";
import type { ExternalConnectionRepository } from "../application/ports/external-connection.repository";
import type { OAuthFlowStateRepository } from "../application/ports/oauth-flow-state.repository";
import type { SyncConfigurationRepository } from "../application/ports/sync-configuration.repository";

export class InMemoryExternalConnectionRepository implements ExternalConnectionRepository {
  readonly connections: ExternalConnection[] = [];

  async findById(input: { organizationId: string; connectionId: string }): Promise<ExternalConnection | null> {
    return this.connections.find((c) => c.id === input.connectionId && c.organizationId === input.organizationId) ?? null;
  }

  async findActiveByOrganizationAndProvider(input: { organizationId: string; provider: ConnectorProvider }): Promise<ExternalConnection | null> {
    const activeStatuses: readonly ConnectionStatus[] = [ConnectionStatus.Pending, ConnectionStatus.Active, ConnectionStatus.ReauthRequired];
    return this.connections.find((c) => c.organizationId === input.organizationId && c.provider === input.provider && activeStatuses.includes(c.status)) ?? null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly ExternalConnection[]> {
    return this.connections.filter((c) => c.organizationId === input.organizationId);
  }

  async save(connection: ExternalConnection): Promise<void> {
    const index = this.connections.findIndex((c) => c.id === connection.id);
    if (index === -1) this.connections.push(connection);
    else this.connections[index] = connection;
  }
}

export class InMemoryOAuthFlowStateRepository implements OAuthFlowStateRepository {
  readonly states: OAuthFlowState[] = [];

  async save(state: OAuthFlowState): Promise<void> {
    const index = this.states.findIndex((s) => s.id === state.id);
    if (index === -1) this.states.push(state);
    else this.states[index] = state;
  }

  async findByState(value: string): Promise<OAuthFlowState | null> {
    return this.states.find((s) => s.state === value) ?? null;
  }

  async consumeIfValid(value: string, now: Date): Promise<OAuthFlowState | null> {
    const found = this.states.find((s) => s.state === value);
    if (!found || found.consumedAt !== undefined || found.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    found.consume(now);
    return found;
  }
}

export class InMemorySyncConfigurationRepository implements SyncConfigurationRepository {
  readonly configs: SyncConfiguration[] = [];

  async findById(input: { organizationId: string; syncConfigurationId: string }): Promise<SyncConfiguration | null> {
    return this.configs.find((c) => c.id === input.syncConfigurationId && c.organizationId === input.organizationId) ?? null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly SyncConfiguration[]> {
    return this.configs.filter((c) => c.organizationId === input.organizationId);
  }

  async save(config: SyncConfiguration): Promise<void> {
    const index = this.configs.findIndex((c) => c.id === config.id);
    if (index === -1) this.configs.push(config);
    else this.configs[index] = config;
  }
}

export class InMemoryCalendarSyncedEventRepository implements CalendarSyncedEventRepository {
  readonly events: CalendarSyncedEvent[] = [];

  async findActive(input: { organizationId: string; connectionId: string; tenderId: string; milestoneId?: string | undefined }): Promise<CalendarSyncedEvent | null> {
    return (
      this.events.find(
        (e) => e.organizationId === input.organizationId && e.connectionId === input.connectionId && e.tenderId === input.tenderId && e.milestoneId === input.milestoneId && e.deletedAt === undefined,
      ) ?? null
    );
  }

  async save(event: CalendarSyncedEvent): Promise<void> {
    const index = this.events.findIndex((e) => e.id === event.id);
    if (index === -1) this.events.push(event);
    else this.events[index] = event;
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: ConnectorAuditLogEntry[] = [];

  async record(entry: ConnectorAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Chiffrement en mémoire, jamais sécurisé — uniquement pour isoler les tests d'application du
 *  détail AES-256-GCM (déjà testé indépendamment, voir `aes-gcm-credential.cipher.spec.ts`). */
export class InMemoryCredentialCipher implements CredentialCipher {
  encrypt(plaintext: string): string {
    return `enc:${plaintext}`;
  }
  decrypt(ciphertext: string): string {
    return ciphertext.replace(/^enc:/, "");
  }
}
