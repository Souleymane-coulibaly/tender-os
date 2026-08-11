import { ResponsePackageVersionValidatedError } from "./errors";
import { ResponsePackageVersionStatus } from "./enums";

export type ResponsePackageVersionProps = {
  id: string;
  organizationId: string;
  responsePackageId: string;
  versionNumber: number;
  status: ResponsePackageVersionStatus;
  createdBy: string;
  createdAt: Date;
  validatedBy?: string | undefined;
  validatedAt?: Date | undefined;
};

/** Historique APPEND-ONLY (mission §11) — une fois VALIDATED (mission §50), cette version devient
 *  IMMUABLE : toute modification (nouvelle pièce, nouvelle qualification, nouveau document
 *  rattaché) exige la création d'une NOUVELLE version, jamais une mutation de celle-ci. */
export class ResponsePackageVersion {
  private constructor(private props: ResponsePackageVersionProps) {}

  static create(input: { id: string; organizationId: string; responsePackageId: string; versionNumber: number; createdBy: string; occurredAt: Date }): ResponsePackageVersion {
    return new ResponsePackageVersion({
      id: input.id,
      organizationId: input.organizationId,
      responsePackageId: input.responsePackageId,
      versionNumber: input.versionNumber,
      status: ResponsePackageVersionStatus.Draft,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: ResponsePackageVersionProps): ResponsePackageVersion {
    return new ResponsePackageVersion(props);
  }

  private assertNotValidated(): void {
    if (this.props.status === ResponsePackageVersionStatus.Validated) {
      throw new ResponsePackageVersionValidatedError();
    }
  }

  markInReview(): void {
    this.assertNotValidated();
    this.props.status = ResponsePackageVersionStatus.InReview;
  }

  /** Mission §42/§50 — état terminal, jamais réversible depuis cette instance. */
  validate(input: { validatedBy: string; occurredAt: Date }): void {
    this.assertNotValidated();
    this.props.status = ResponsePackageVersionStatus.Validated;
    this.props.validatedBy = input.validatedBy;
    this.props.validatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get responsePackageId(): string {
    return this.props.responsePackageId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get status(): ResponsePackageVersionStatus {
    return this.props.status;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get isValidated(): boolean {
    return this.props.status === ResponsePackageVersionStatus.Validated;
  }
}
