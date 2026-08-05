import { validateStructuredCapacityStatement, type StructuredCapacityStatement } from "./structured-capacity-statement";

export type Dc2DeclarationVersionProps = {
  id: string;
  organizationId: string;
  dc2DeclarationId: string;
  version: number;
  data: StructuredCapacityStatement;
  createdBy: string;
  createdAt: Date;
};

/** Sprint 8C Phase 2 — mission §11 : un snapshot IMMUABLE. Jamais modifié après création — une
 *  correction crée toujours une nouvelle version. */
export class Dc2DeclarationVersion {
  private constructor(private readonly props: Dc2DeclarationVersionProps) {}

  static create(input: { id: string; organizationId: string; dc2DeclarationId: string; version: number; data: StructuredCapacityStatement; createdBy: string; occurredAt: Date }): Dc2DeclarationVersion {
    return new Dc2DeclarationVersion({
      id: input.id,
      organizationId: input.organizationId,
      dc2DeclarationId: input.dc2DeclarationId,
      version: input.version,
      data: validateStructuredCapacityStatement(input.data),
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: Dc2DeclarationVersionProps): Dc2DeclarationVersion {
    return new Dc2DeclarationVersion(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get dc2DeclarationId(): string {
    return this.props.dc2DeclarationId;
  }
  get version(): number {
    return this.props.version;
  }
  get data(): StructuredCapacityStatement {
    return this.props.data;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
