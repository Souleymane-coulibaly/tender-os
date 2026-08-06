import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { DuplicateSiretInOrganizationError, InvalidCompanyIdentifierFormatError } from "../../domain/errors";
import { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "../../domain/french-company-identifiers";
import type { CompanyLegalIdentityRecord } from "../dtos";
import { COMPANY_LEGAL_IDENTITY_REPOSITORY, type CompanyLegalIdentityRepository } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type UpsertCompanyLegalIdentityCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  legalName?: string | undefined;
  tradeName?: string | undefined;
  siren?: string | undefined;
  siretPrincipal?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  shareCapitalAmount?: string | undefined;
  shareCapitalCurrency?: string | undefined;
  apeCode?: string | undefined;
  incorporatedAt?: Date | undefined;
  rcsNumber?: string | undefined;
  rcsCity?: string | undefined;
  registrationCountry?: string | undefined;
  addressLine?: string | undefined;
  addressComplement?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  country?: string | undefined;
  phone?: string | undefined;
  generalEmail?: string | undefined;
  website?: string | undefined;
  confirmDuplicate?: boolean | undefined;
}>;

@Injectable()
export class GetCompanyLegalIdentityUseCase {
  constructor(
    @Inject(COMPANY_LEGAL_IDENTITY_REPOSITORY) private readonly repository: CompanyLegalIdentityRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyLegalIdentityRecord | null> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.findByClientAccount(input);
  }
}

/** Mission §4.1 — jamais bloquant sur l'incomplétude, mais rejette un format structurellement
 *  invalide FOURNI. Détecte un doublon de SIRET dans l'organisation ("sauf justification
 *  explicite" — `confirmDuplicate`). */
@Injectable()
export class UpsertCompanyLegalIdentityUseCase {
  constructor(
    @Inject(COMPANY_LEGAL_IDENTITY_REPOSITORY) private readonly repository: CompanyLegalIdentityRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: UpsertCompanyLegalIdentityCommand): Promise<CompanyLegalIdentityRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });

    if (command.siren !== undefined && !isValidSiren(command.siren)) {
      throw new InvalidCompanyIdentifierFormatError("siren");
    }
    if (command.siretPrincipal !== undefined && !isValidSiret(command.siretPrincipal)) {
      throw new InvalidCompanyIdentifierFormatError("siretPrincipal");
    }
    if (command.vatNumber !== undefined && command.vatNumber.toUpperCase().startsWith("FR") && !isValidFrenchVatNumber(command.vatNumber)) {
      throw new InvalidCompanyIdentifierFormatError("vatNumber");
    }

    if (command.siretPrincipal && !command.confirmDuplicate) {
      const duplicate = await this.repository.findDuplicateSiretInOrganization({
        organizationId: command.organizationId,
        siret: command.siretPrincipal,
        excludeClientAccountId: command.clientAccountId,
      });
      if (duplicate) {
        throw new DuplicateSiretInOrganizationError();
      }
    }

    const existing = await this.repository.findByClientAccount({ organizationId: command.organizationId, clientAccountId: command.clientAccountId });
    const now = this.clock.now();

    const saved = await this.repository.upsert({
      id: existing?.id,
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      legalName: command.legalName ?? existing?.legalName ?? null,
      tradeName: command.tradeName ?? existing?.tradeName ?? null,
      siren: command.siren ?? existing?.siren ?? null,
      siretPrincipal: command.siretPrincipal ?? existing?.siretPrincipal ?? null,
      vatNumber: command.vatNumber ?? existing?.vatNumber ?? null,
      legalForm: command.legalForm ?? existing?.legalForm ?? null,
      shareCapitalAmount: command.shareCapitalAmount ?? existing?.shareCapitalAmount ?? null,
      shareCapitalCurrency: command.shareCapitalCurrency ?? existing?.shareCapitalCurrency ?? null,
      apeCode: command.apeCode ?? existing?.apeCode ?? null,
      incorporatedAt: command.incorporatedAt ?? existing?.incorporatedAt ?? null,
      rcsNumber: command.rcsNumber ?? existing?.rcsNumber ?? null,
      rcsCity: command.rcsCity ?? existing?.rcsCity ?? null,
      registrationCountry: command.registrationCountry ?? existing?.registrationCountry ?? null,
      addressLine: command.addressLine ?? existing?.addressLine ?? null,
      addressComplement: command.addressComplement ?? existing?.addressComplement ?? null,
      postalCode: command.postalCode ?? existing?.postalCode ?? null,
      city: command.city ?? existing?.city ?? null,
      region: command.region ?? existing?.region ?? null,
      country: command.country ?? existing?.country ?? null,
      phone: command.phone ?? existing?.phone ?? null,
      generalEmail: command.generalEmail ?? existing?.generalEmail ?? null,
      website: command.website ?? existing?.website ?? null,
      status: existing?.status ?? "ACTIVE",
      lastValidatedAt: existing?.lastValidatedAt ?? null,
      lastValidatedByUserId: existing?.lastValidatedByUserId ?? null,
      createdBy: existing?.createdBy ?? command.actorId,
      updatedBy: command.actorId,
      updatedAt: now,
    });

    // Mission §11 : événement ciblé — un seul par enregistrement de l'identité légale, jamais un
    // événement par satellite modifié (mission "avec parcimonie, pas à chaque frappe clavier").
    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "CandidateCompanyProfileUpdated",
          aggregateType: "ClientAccount",
          aggregateId: command.clientAccountId,
          payload: { clientAccountId: command.clientAccountId, legalIdentityId: saved.id },
          occurredAt: now,
        },
      ],
    });

    return saved;
  }
}

export { randomUUID };
