import type { ApiKeyScope } from "./enums";

export type ApiKeyProps = {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: readonly ApiKeyScope[];
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date | undefined;
  expiresAt?: Date | undefined;
  revokedAt?: Date | undefined;
  revokedBy?: string | undefined;
};

/**
 * Mission §10-19 — clé API en tant que "principal technique" plafonné : jamais un rôle
 * d'organisation complet (OWNER/ADMIN), sa surface d'action est ENTIÈREMENT définie par
 * `scopes` (quelles opérations) et `allowedClientAccountIds` (quels clients — narrowing
 * STRICT uniquement, jamais un élargissement, décision validée §17/§18).
 */
export class ApiKey {
  private constructor(private props: ApiKeyProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: readonly ApiKeyScope[];
    allowedClientAccountIds: readonly string[];
    createdBy: string;
    occurredAt: Date;
    expiresAt?: Date | undefined;
  }): ApiKey {
    return new ApiKey({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      allowedClientAccountIds: input.allowedClientAccountIds,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      expiresAt: input.expiresAt,
    });
  }

  static rehydrate(props: ApiKeyProps): ApiKey {
    return new ApiKey(props);
  }

  revoke(input: { revokedBy: string; occurredAt: Date }): void {
    this.props.revokedAt = input.occurredAt;
    this.props.revokedBy = input.revokedBy;
  }

  recordUsage(occurredAt: Date): void {
    this.props.lastUsedAt = occurredAt;
  }

  /** Mission §12/§13/§96 — révoquée OU expirée = refusée, jamais un état "à moitié valide". */
  isUsable(now: Date): boolean {
    if (this.props.revokedAt !== undefined) return false;
    if (this.props.expiresAt !== undefined && this.props.expiresAt.getTime() <= now.getTime()) return false;
    return true;
  }

  hasScope(scope: ApiKeyScope): boolean {
    return this.props.scopes.includes(scope);
  }

  /** Mission §18 — `undefined` = aucune restriction supplémentaire (le principal technique voit
   *  tout ce que ses scopes autorisent) ; sinon narrowing STRICT à cette liste exacte. */
  isClientAllowed(clientAccountId: string): boolean {
    if (this.props.allowedClientAccountIds.length === 0) return true;
    return this.props.allowedClientAccountIds.includes(clientAccountId);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get name(): string {
    return this.props.name;
  }
  get keyPrefix(): string {
    return this.props.keyPrefix;
  }
  get keyHash(): string {
    return this.props.keyHash;
  }
  get scopes(): readonly ApiKeyScope[] {
    return this.props.scopes;
  }
  get allowedClientAccountIds(): readonly string[] {
    return this.props.allowedClientAccountIds;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get lastUsedAt(): Date | undefined {
    return this.props.lastUsedAt;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }
  get revokedBy(): string | undefined {
    return this.props.revokedBy;
  }
}
