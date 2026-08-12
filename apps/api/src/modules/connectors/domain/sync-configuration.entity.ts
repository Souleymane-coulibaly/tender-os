import type { SyncDirection } from "./enums";

export type SyncConfigurationProps = {
  id: string;
  organizationId: string;
  connectionId: string;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  remoteContainerId: string;
  remoteFolderId: string;
  direction: SyncDirection;
  enabled: boolean;
  conflictPolicy: string;
  lastSyncAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mission §35 — configuration déclarative d'un couple (dossier distant, dossier TenderOS logique).
 * Ce sprint : modèle créé, PERSISTÉ, mais AUCUN worker ne le consomme automatiquement (décision
 * validée AskUserQuestion, mission §37 "Manual First"). `enabled`/`lastSyncAt` sont donc inertes
 * pour l'instant — prêts pour l'activation d'un sync automatique dans un sprint ultérieur, jamais
 * un champ mort ajouté "au cas où" (mission CLAUDE.md "ne jamais développer une fonctionnalité
 * uniquement pour un besoin ponctuel") : `enabled` sert dès maintenant à afficher/masquer la
 * configuration côté UI, `lastSyncAt` est mis à jour par le flux d'import/export MANUEL lui-même.
 */
export class SyncConfiguration {
  private constructor(private props: SyncConfigurationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    connectionId: string;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    remoteContainerId: string;
    remoteFolderId: string;
    direction: SyncDirection;
    conflictPolicy: string;
    createdBy: string;
    occurredAt: Date;
  }): SyncConfiguration {
    return new SyncConfiguration({
      id: input.id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      remoteContainerId: input.remoteContainerId,
      remoteFolderId: input.remoteFolderId,
      direction: input.direction,
      enabled: true,
      conflictPolicy: input.conflictPolicy,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SyncConfigurationProps): SyncConfiguration {
    return new SyncConfiguration(props);
  }

  setEnabled(enabled: boolean, occurredAt: Date): void {
    this.props.enabled = enabled;
    this.props.updatedAt = occurredAt;
  }

  recordSync(occurredAt: Date): void {
    this.props.lastSyncAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get connectionId(): string {
    return this.props.connectionId;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get tenderId(): string | undefined {
    return this.props.tenderId;
  }
  get remoteContainerId(): string {
    return this.props.remoteContainerId;
  }
  get remoteFolderId(): string {
    return this.props.remoteFolderId;
  }
  get direction(): SyncDirection {
    return this.props.direction;
  }
  get enabled(): boolean {
    return this.props.enabled;
  }
  get conflictPolicy(): string {
    return this.props.conflictPolicy;
  }
  get lastSyncAt(): Date | undefined {
    return this.props.lastSyncAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
