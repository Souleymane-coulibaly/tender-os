import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { CalendarSyncedEvent } from "../domain/calendar-synced-event.entity";
import type { ConnectorProvider } from "../domain/enums";
import type { ExternalConnection } from "../domain/external-connection.entity";
import type { ExternalFileExportRecord } from "../domain/external-file-export-record.entity";
import type { ExternalFileImportRecord } from "../domain/external-file-import-record.entity";
import type { OAuthFlowState } from "../domain/oauth-flow-state.entity";
import type { SyncConfiguration } from "../domain/sync-configuration.entity";
import { ConnectionStatus } from "../domain/enums";
import { ExternalConnectionNotFoundError } from "../domain/errors";
import type { AuditLogWriter, ConnectorAuditLogEntry } from "../application/ports/audit-log-writer";
import type { CalendarSyncedEventRepository } from "../application/ports/calendar-synced-event.repository";
import type {
  ConnectorProviderAdapter,
  DownloadedFile,
  OAuthAccountInfo,
  OAuthTokenResult,
  RemoteFile,
  RemoteFolderListing,
} from "../application/ports/connector-provider-adapter";
import type { CredentialCipher } from "../application/ports/credential-cipher";
import type { ExternalConnectionRepository } from "../application/ports/external-connection.repository";
import type { ExternalFileExportRecordRepository } from "../application/ports/external-file-export-record.repository";
import type { ExternalFileImportRecordRepository } from "../application/ports/external-file-import-record.repository";
import type { OAuthFlowStateRepository } from "../application/ports/oauth-flow-state.repository";
import type { SyncConfigurationRepository } from "../application/ports/sync-configuration.repository";

export const FIXED_NOW = new Date("2026-08-16T10:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

/** Mutex par clé (mirroir `pg_advisory_xact_lock` des implémentations Prisma) — nécessaire pour que
 *  les tests de concurrence exercent réellement une exclusion mutuelle sur un `Promise.all` de deux
 *  appels simultanés, plutôt que de dépendre par accident de l'ordre d'exécution du micro-task
 *  queue. Partagé par les fakes `ExternalConnection`/`ExternalFileImportRecord`/
 *  `ExternalFileExportRecord` — chacun garde sa propre `Map` (jamais un verrou partagé entre eux). */
function createKeyedMutex() {
  const locks = new Map<string, Promise<unknown>>();
  return async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(
      key,
      previous.then(() => held),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export class InMemoryExternalConnectionRepository implements ExternalConnectionRepository {
  readonly connections: ExternalConnection[] = [];
  /** Mutex par connexion (mirroir `pg_advisory_xact_lock` de l'implémentation Prisma) — nécessaire
   *  pour que les tests de concurrence (mission §95) exercent réellement une exclusion mutuelle sur
   *  un `Promise.all` de deux appels simultanés, plutôt que de dépendre par accident de l'ordre
   *  d'exécution du micro-task queue. */
  private readonly locks = new Map<string, Promise<unknown>>();

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

  async withLock<T>(input: { organizationId: string; connectionId: string }, fn: (connection: ExternalConnection) => Promise<T>): Promise<T> {
    const previous = this.locks.get(input.connectionId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      input.connectionId,
      previous.then(() => held),
    );
    await previous;
    try {
      const connection = await this.findById(input);
      if (!connection) throw new ExternalConnectionNotFoundError();
      try {
        return await fn(connection);
      } finally {
        await this.save(connection);
      }
    } finally {
      release();
    }
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

export class InMemoryExternalFileImportRecordRepository implements ExternalFileImportRecordRepository {
  readonly records: ExternalFileImportRecord[] = [];
  private readonly withKeyLock = createKeyedMutex();

  async findByRemoteFile(input: { organizationId: string; connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }): Promise<ExternalFileImportRecord | null> {
    return (
      this.records.find(
        (r) =>
          r.organizationId === input.organizationId &&
          r.connectionId === input.connectionId &&
          r.remoteContainerId === input.remoteContainerId &&
          r.remoteFileId === input.remoteFileId &&
          r.targetDocumentId === input.targetDocumentId,
      ) ?? null
    );
  }

  async save(record: ExternalFileImportRecord): Promise<void> {
    const index = this.records.findIndex((r) => r.id === record.id);
    if (index === -1) this.records.push(record);
    else this.records[index] = record;
  }

  async delete(id: string): Promise<void> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index !== -1) this.records.splice(index, 1);
  }

  async withLock<T>(key: { connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }, fn: () => Promise<T>): Promise<T> {
    const lockKey = `${key.connectionId}:${key.remoteContainerId}:${key.remoteFileId}:${key.targetDocumentId ?? "NEW"}`;
    return this.withKeyLock(lockKey, fn);
  }
}

export class InMemoryExternalFileExportRecordRepository implements ExternalFileExportRecordRepository {
  readonly records: ExternalFileExportRecord[] = [];
  private readonly withKeyLock = createKeyedMutex();

  async findByDestination(input: { organizationId: string; connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }): Promise<ExternalFileExportRecord | null> {
    return (
      this.records.find(
        (r) =>
          r.organizationId === input.organizationId &&
          r.connectionId === input.connectionId &&
          r.documentId === input.documentId &&
          r.documentVersionId === input.documentVersionId &&
          r.remoteContainerId === input.remoteContainerId &&
          r.remoteFolderId === input.remoteFolderId &&
          r.filename === input.filename,
      ) ?? null
    );
  }

  async save(record: ExternalFileExportRecord): Promise<void> {
    const index = this.records.findIndex((r) => r.id === record.id);
    if (index === -1) this.records.push(record);
    else this.records[index] = record;
  }

  async delete(id: string): Promise<void> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index !== -1) this.records.splice(index, 1);
  }

  async withLock<T>(key: { connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }, fn: () => Promise<T>): Promise<T> {
    const lockKey = `${key.connectionId}:${key.documentId}:${key.documentVersionId}:${key.remoteContainerId}:${key.remoteFolderId}:${key.filename}`;
    return this.withKeyLock(lockKey, fn);
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

/**
 * Mission P1 (audit Codex, R2/Connecteurs §12/§13) — double de test pour Microsoft/Google : enregistre
 * exactement le contrat reçu par `uploadFile` (jamais un appel réseau réel) pour prouver que le
 * contenu transmis au connecteur provient bien du flux résolu par TenderOS (local ou R2), avec le
 * bon nom de fichier et le bon type MIME — jamais une URL signée transmise telle quelle.
 */
export class FakeConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly uploadCalls: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }[] = [];

  constructor(public readonly provider: ConnectorProvider) {}

  buildAuthorizationUrl(): string {
    throw new Error("not implemented in this fake");
  }
  async exchangeCodeForTokens(): Promise<OAuthTokenResult> {
    throw new Error("not implemented in this fake");
  }
  async refreshAccessToken(): Promise<OAuthTokenResult> {
    throw new Error("not implemented in this fake");
  }
  async fetchAccountInfo(): Promise<OAuthAccountInfo> {
    throw new Error("not implemented in this fake");
  }
  async revokeToken(): Promise<void> {}
  async listContainers(): Promise<never[]> {
    return [];
  }
  async listFolderChildren(): Promise<RemoteFolderListing> {
    return { folders: [], files: [] };
  }
  async downloadFile(): Promise<DownloadedFile> {
    throw new Error("not implemented in this fake");
  }
  async createCalendarEvent(): Promise<{ externalEventId: string }> {
    throw new Error("not implemented in this fake");
  }

  async uploadFile(_accessToken: string, input: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }): Promise<RemoteFile> {
    this.uploadCalls.push(input);
    return {
      id: `remote-file-${this.uploadCalls.length}`,
      name: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.content.length,
      modifiedAt: new Date(),
    };
  }
}
