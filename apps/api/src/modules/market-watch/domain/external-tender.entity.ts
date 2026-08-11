import { createHash } from "node:crypto";

export type ExternalTenderLot = Readonly<{ number: string; description?: string | undefined; cpvCode?: string | undefined }>;

export type ExternalTenderProps = {
  id: string;
  organizationId: string;
  source: string;
  marketType: string;
  externalId: string;
  title: string;
  description?: string | undefined;
  buyerName?: string | undefined;
  buyerType?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  department?: string | undefined;
  city?: string | undefined;
  cpvCodes: string[];
  estimatedAmount?: number | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  sourceUrl?: string | undefined;
  lots?: ExternalTenderLot[] | undefined;
  rawMetadata?: Record<string, unknown> | undefined;
  checksum?: string | undefined;
  firstSeenAt: Date;
  lastFetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** Champs normalisés dont un changement constitue une "mise à jour significative" (mission §12) —
 *  jamais `rawMetadata`/`lastFetchedAt`, trop volatils pour un hash stable. */
type ChecksumInput = Pick<
  ExternalTenderProps,
  "title" | "description" | "buyerName" | "country" | "region" | "department" | "city" | "cpvCodes" | "estimatedAmount" | "procedureType" | "submissionDeadline" | "lots"
>;

export function computeExternalTenderChecksum(input: ChecksumInput): string {
  const stable = JSON.stringify({
    title: input.title,
    description: input.description ?? null,
    buyerName: input.buyerName ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    department: input.department ?? null,
    city: input.city ?? null,
    cpvCodes: [...input.cpvCodes].sort(),
    estimatedAmount: input.estimatedAmount ?? null,
    procedureType: input.procedureType ?? null,
    submissionDeadline: input.submissionDeadline?.toISOString() ?? null,
    lots: input.lots ?? null,
  });
  return createHash("sha256").update(stable).digest("hex");
}

/** Mission §8/§10 — marché externe normalisé, provenance conservée. `computeExternalTenderChecksum`
 *  détecte une mise à jour significative (mission §12) sans dépendre de `rawMetadata`. */
export class ExternalTender {
  private constructor(private props: ExternalTenderProps) {}

  static create(input: Omit<ExternalTenderProps, "firstSeenAt" | "lastFetchedAt" | "createdAt" | "updatedAt" | "checksum"> & { occurredAt: Date }): ExternalTender {
    const checksum = computeExternalTenderChecksum(input);
    return new ExternalTender({
      ...input,
      checksum,
      firstSeenAt: input.occurredAt,
      lastFetchedAt: input.occurredAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExternalTenderProps): ExternalTender {
    return new ExternalTender(props);
  }

  /** Mission §12 — met à jour les champs normalisés si le checksum a changé, toujours
   *  `lastFetchedAt`. Retourne `true` si une mise à jour SIGNIFICATIVE a eu lieu (déclenche
   *  `external_tender.updated`), `false` si seule la fraîcheur a été rafraîchie. */
  applyFetch(input: Omit<ExternalTenderProps, "id" | "organizationId" | "source" | "externalId" | "firstSeenAt" | "lastFetchedAt" | "createdAt" | "updatedAt" | "checksum"> & { occurredAt: Date }): boolean {
    const newChecksum = computeExternalTenderChecksum(input);
    const changed = newChecksum !== this.props.checksum;

    this.props = {
      ...this.props,
      ...input,
      checksum: newChecksum,
      lastFetchedAt: input.occurredAt,
      updatedAt: changed ? input.occurredAt : this.props.updatedAt,
    };

    return changed;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get source(): string {
    return this.props.source;
  }
  get marketType(): string {
    return this.props.marketType;
  }
  get externalId(): string {
    return this.props.externalId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get buyerName(): string | undefined {
    return this.props.buyerName;
  }
  get buyerType(): string | undefined {
    return this.props.buyerType;
  }
  get country(): string | undefined {
    return this.props.country;
  }
  get region(): string | undefined {
    return this.props.region;
  }
  get department(): string | undefined {
    return this.props.department;
  }
  get city(): string | undefined {
    return this.props.city;
  }
  get cpvCodes(): readonly string[] {
    return this.props.cpvCodes;
  }
  get estimatedAmount(): number | undefined {
    return this.props.estimatedAmount;
  }
  get currency(): string | undefined {
    return this.props.currency;
  }
  get procedureType(): string | undefined {
    return this.props.procedureType;
  }
  get publicationDate(): Date | undefined {
    return this.props.publicationDate;
  }
  get submissionDeadline(): Date | undefined {
    return this.props.submissionDeadline;
  }
  get sourceUrl(): string | undefined {
    return this.props.sourceUrl;
  }
  get lots(): readonly ExternalTenderLot[] | undefined {
    return this.props.lots;
  }
  get rawMetadata(): Record<string, unknown> | undefined {
    return this.props.rawMetadata;
  }
  get checksum(): string | undefined {
    return this.props.checksum;
  }
  get firstSeenAt(): Date {
    return this.props.firstSeenAt;
  }
  get lastFetchedAt(): Date {
    return this.props.lastFetchedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
