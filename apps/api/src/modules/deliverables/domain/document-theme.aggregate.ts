import { ScopeLevel } from "./scope-level";

export type DocumentThemeProps = {
  id: string;
  organizationId: string;
  scopeLevel: ScopeLevel;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  name: string;
  createdBy: string;
  createdAt: Date;
};

const MAX_NAME_LENGTH = 200;

/** Mission Sprint 8A.1 §6 — identité stable d'un thème documentaire (logo/couleurs/polices/mise en
 *  page réels sur `DocumentThemeVersion`). Même règle de portée que `DeliverableTemplate`. */
export class DocumentTheme {
  private constructor(private readonly props: DocumentThemeProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    name: string;
    createdBy: string;
    occurredAt: Date;
  }): DocumentTheme {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      throw new Error(`name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    if (input.scopeLevel === ScopeLevel.Tender && !input.tenderId) {
      throw new Error("a TENDER-scoped theme requires tenderId");
    }
    if (input.scopeLevel === ScopeLevel.Client && !input.clientAccountId) {
      throw new Error("a CLIENT-scoped theme requires clientAccountId");
    }
    if (input.scopeLevel === ScopeLevel.Organization && (input.tenderId || input.clientAccountId)) {
      throw new Error("an ORGANIZATION-scoped theme must not reference a tender or client");
    }
    return new DocumentTheme({
      id: input.id,
      organizationId: input.organizationId,
      scopeLevel: input.scopeLevel,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      name: trimmedName,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentThemeProps): DocumentTheme {
    return new DocumentTheme(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get scopeLevel(): ScopeLevel {
    return this.props.scopeLevel;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get tenderId(): string | undefined {
    return this.props.tenderId;
  }
  get name(): string {
    return this.props.name;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
