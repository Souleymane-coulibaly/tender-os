import { ScopeLevel } from "./scope-level";
import type { DeliverableType } from "./deliverable-type";

export type DeliverableTemplateProps = {
  id: string;
  organizationId: string;
  scopeLevel: ScopeLevel;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  documentType: DeliverableType;
  name: string;
  description?: string | undefined;
  /** Mission §5 — documente "template imposé par l'acheteur" (mappé sur le palier TENDER, voir
   *  `scope-level.ts`) : note libre, jamais une structure interprétée. */
  note?: string | undefined;
  createdBy: string;
  createdAt: Date;
};

const MAX_NAME_LENGTH = 200;

/** Mission Sprint 8A.1 §5 — identité stable d'un template de mémoire (structure/versionnement réels
 *  sur `DeliverableTemplateVersion`). Un template TENDER exige `tenderId`, un template CLIENT exige
 *  `clientAccountId`, un template ORGANIZATION n'exige ni l'un ni l'autre — jamais les deux à la fois. */
export class DeliverableTemplate {
  private constructor(private readonly props: DeliverableTemplateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    documentType: DeliverableType;
    name: string;
    description?: string | undefined;
    note?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): DeliverableTemplate {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      throw new Error(`name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    if (input.scopeLevel === ScopeLevel.Tender && !input.tenderId) {
      throw new Error("a TENDER-scoped template requires tenderId");
    }
    if (input.scopeLevel === ScopeLevel.Client && !input.clientAccountId) {
      throw new Error("a CLIENT-scoped template requires clientAccountId");
    }
    if (input.scopeLevel === ScopeLevel.Organization && (input.tenderId || input.clientAccountId)) {
      throw new Error("an ORGANIZATION-scoped template must not reference a tender or client");
    }
    return new DeliverableTemplate({
      id: input.id,
      organizationId: input.organizationId,
      scopeLevel: input.scopeLevel,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      documentType: input.documentType,
      name: trimmedName,
      description: input.description,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableTemplateProps): DeliverableTemplate {
    return new DeliverableTemplate(props);
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
  get documentType(): DeliverableType {
    return this.props.documentType;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get note(): string | undefined {
    return this.props.note;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
