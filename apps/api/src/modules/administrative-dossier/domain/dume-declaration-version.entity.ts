import { validateStructuredCapacityStatement, type StructuredCapacityStatement } from "./structured-capacity-statement";

export type DumeDeclarationVersionProps = {
  id: string;
  organizationId: string;
  dumeDeclarationId: string;
  version: number;
  data: StructuredCapacityStatement;
  createdBy: string;
  createdAt: Date;
};

/** Sprint 8C Phase 2 — snapshot IMMUABLE, même motif que `Dc2DeclarationVersion`. */
export class DumeDeclarationVersion {
  private constructor(private readonly props: DumeDeclarationVersionProps) {}

  static create(input: { id: string; organizationId: string; dumeDeclarationId: string; version: number; data: StructuredCapacityStatement; createdBy: string; occurredAt: Date }): DumeDeclarationVersion {
    return new DumeDeclarationVersion({
      id: input.id,
      organizationId: input.organizationId,
      dumeDeclarationId: input.dumeDeclarationId,
      version: input.version,
      data: validateStructuredCapacityStatement(input.data),
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DumeDeclarationVersionProps): DumeDeclarationVersion {
    return new DumeDeclarationVersion(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get dumeDeclarationId(): string {
    return this.props.dumeDeclarationId;
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
