export type CandidateEstablishmentProps = {
  id: string;
  organizationId: string;
  candidateCompanyId: string;
  siret: string;
  label?: string | undefined;
  isPrincipal: boolean;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Établissement (SIRET) d'une `CandidateCompany` (mission TenderOS 2.1 §"CANDIDATE ESTABLISHMENT")
 * — entité pure, jamais un agrégat au sens strict (même motif que `ClientAssignment`) : son cycle de
 * vie est entièrement porté par les use cases dédiés (`AddCandidateEstablishmentUseCase`).
 */
export class CandidateEstablishment {
  private constructor(private props: CandidateEstablishmentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    candidateCompanyId: string;
    siret: string;
    label?: string | undefined;
    isPrincipal?: boolean | undefined;
    addressLine?: string | undefined;
    postalCode?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): CandidateEstablishment {
    return new CandidateEstablishment({
      id: input.id,
      organizationId: input.organizationId,
      candidateCompanyId: input.candidateCompanyId,
      siret: input.siret,
      label: input.label,
      isPrincipal: input.isPrincipal ?? false,
      addressLine: input.addressLine,
      postalCode: input.postalCode,
      city: input.city,
      country: input.country,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: CandidateEstablishmentProps): CandidateEstablishment {
    return new CandidateEstablishment(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get candidateCompanyId(): string {
    return this.props.candidateCompanyId;
  }
  get siret(): string {
    return this.props.siret;
  }
  get label(): string | undefined {
    return this.props.label;
  }
  get isPrincipal(): boolean {
    return this.props.isPrincipal;
  }
  get addressLine(): string | undefined {
    return this.props.addressLine;
  }
  get postalCode(): string | undefined {
    return this.props.postalCode;
  }
  get city(): string | undefined {
    return this.props.city;
  }
  get country(): string | undefined {
    return this.props.country;
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
