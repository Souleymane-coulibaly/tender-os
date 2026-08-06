export type BuyerProps = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  identifier?: string | undefined;
  siret?: string | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  buyerType?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  profileUrl?: string | undefined;
  notes?: string | undefined;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type BuyerUpdate = {
  name?: string | undefined;
  legalName?: string | undefined;
  identifier?: string | undefined;
  siret?: string | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  buyerType?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  profileUrl?: string | undefined;
  notes?: string | undefined;
};

/**
 * Acheteur/donneur d'ordre (V2 Sprint 3 §5) — jamais un `ClientAccount` (mission "ne jamais
 * utiliser les données de l'acheteur comme données du candidat"), réutilisable par plusieurs
 * Tenders de la même organisation. Aucune donnée n'est inventée : tous les champs sont
 * optionnels sauf `name`.
 */
export class Buyer {
  private constructor(private props: BuyerProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    legalName?: string | undefined;
    identifier?: string | undefined;
    siret?: string | undefined;
    addressLine?: string | undefined;
    postalCode?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    buyerType?: string | undefined;
    contactName?: string | undefined;
    contactEmail?: string | undefined;
    contactPhone?: string | undefined;
    profileUrl?: string | undefined;
    notes?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Buyer {
    return new Buyer({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      legalName: input.legalName,
      identifier: input.identifier,
      siret: input.siret,
      addressLine: input.addressLine,
      postalCode: input.postalCode,
      city: input.city,
      country: input.country,
      buyerType: input.buyerType,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      profileUrl: input.profileUrl,
      notes: input.notes,
      createdBy: input.createdBy,
      updatedBy: undefined,
      archivedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: BuyerProps): Buyer {
    return new Buyer(props);
  }

  update(update: BuyerUpdate, actorId: string, occurredAt: Date): void {
    if (update.name !== undefined) this.props.name = update.name;
    if (update.legalName !== undefined) this.props.legalName = update.legalName;
    if (update.identifier !== undefined) this.props.identifier = update.identifier;
    if (update.siret !== undefined) this.props.siret = update.siret;
    if (update.addressLine !== undefined) this.props.addressLine = update.addressLine;
    if (update.postalCode !== undefined) this.props.postalCode = update.postalCode;
    if (update.city !== undefined) this.props.city = update.city;
    if (update.country !== undefined) this.props.country = update.country;
    if (update.buyerType !== undefined) this.props.buyerType = update.buyerType;
    if (update.contactName !== undefined) this.props.contactName = update.contactName;
    if (update.contactEmail !== undefined) this.props.contactEmail = update.contactEmail;
    if (update.contactPhone !== undefined) this.props.contactPhone = update.contactPhone;
    if (update.profileUrl !== undefined) this.props.profileUrl = update.profileUrl;
    if (update.notes !== undefined) this.props.notes = update.notes;
    this.props.updatedBy = actorId;
    this.props.updatedAt = occurredAt;
  }

  archive(actorId: string, occurredAt: Date): void {
    this.props.archivedAt = occurredAt;
    this.props.updatedBy = actorId;
    this.props.updatedAt = occurredAt;
  }

  restore(actorId: string, occurredAt: Date): void {
    this.props.archivedAt = undefined;
    this.props.updatedBy = actorId;
    this.props.updatedAt = occurredAt;
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
  get legalName(): string | undefined {
    return this.props.legalName;
  }
  get identifier(): string | undefined {
    return this.props.identifier;
  }
  get siret(): string | undefined {
    return this.props.siret;
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
  get buyerType(): string | undefined {
    return this.props.buyerType;
  }
  get contactName(): string | undefined {
    return this.props.contactName;
  }
  get contactEmail(): string | undefined {
    return this.props.contactEmail;
  }
  get contactPhone(): string | undefined {
    return this.props.contactPhone;
  }
  get profileUrl(): string | undefined {
    return this.props.profileUrl;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string | undefined {
    return this.props.updatedBy;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
