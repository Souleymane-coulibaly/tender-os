import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { SigningPowerNotFoundError } from "../../domain/errors";
import { SigningPower } from "../../domain/signing-power.aggregate";
import { SigningPowerSummary, toSigningPowerSummary } from "../dtos-structured";
import { SIGNING_POWER_REPOSITORY, type SigningPowerRepository } from "../ports/signing-power.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type CreateSigningPowerCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  holderName: string;
  representedEntityDescription: string;
  validFrom?: Date | undefined;
  expiresAt?: Date | undefined;
  scope: string;
  limitations?: string | undefined;
}>;

/** Mission §17 — plusieurs pouvoirs possibles par Tender. */
@Injectable()
export class CreateSigningPowerUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SIGNING_POWER_REPOSITORY) private readonly repository: SigningPowerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateSigningPowerCommand): Promise<SigningPowerSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    const power = SigningPower.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      holderName: command.holderName,
      representedEntityDescription: command.representedEntityDescription,
      validFrom: command.validFrom,
      expiresAt: command.expiresAt,
      scope: command.scope,
      limitations: command.limitations,
      createdBy: command.actorId,
      occurredAt,
    });
    await this.repository.create(power);
    return toSigningPowerSummary(power, occurredAt);
  }
}

export type UpdateSigningPowerCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  signingPowerId: string;
  holderName?: string | undefined;
  representedEntityDescription?: string | undefined;
  validFrom?: Date | undefined;
  expiresAt?: Date | undefined;
  scope?: string | undefined;
  limitations?: string | undefined;
  administrativeDocumentId?: string | undefined;
}>;

@Injectable()
export class UpdateSigningPowerUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SIGNING_POWER_REPOSITORY) private readonly repository: SigningPowerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateSigningPowerCommand): Promise<SigningPowerSummary> {
    const power = await this.repository.findById({ organizationId: command.organizationId, signingPowerId: command.signingPowerId });
    if (!power) throw new SigningPowerNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: power.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    if (command.holderName !== undefined || command.representedEntityDescription !== undefined || command.validFrom !== undefined || command.expiresAt !== undefined || command.scope !== undefined || command.limitations !== undefined) {
      power.update({
        holderName: command.holderName,
        representedEntityDescription: command.representedEntityDescription,
        validFrom: command.validFrom,
        expiresAt: command.expiresAt,
        scope: command.scope,
        limitations: command.limitations,
        occurredAt,
      });
    }
    if (command.administrativeDocumentId !== undefined) {
      power.linkDocument({ administrativeDocumentId: command.administrativeDocumentId, occurredAt });
    }
    await this.repository.save(power);
    return toSigningPowerSummary(power, occurredAt);
  }
}

export type VerifySigningPowerCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; signingPowerId: string }>;

/** Mission §17 — "permission du validateur" : réservé aux acteurs pouvant VALIDER le dossier
 *  (même palier que la confirmation d'exigence), jamais une simple gestion. */
@Injectable()
export class VerifySigningPowerUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SIGNING_POWER_REPOSITORY) private readonly repository: SigningPowerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: VerifySigningPowerCommand): Promise<SigningPowerSummary> {
    const power = await this.repository.findById({ organizationId: command.organizationId, signingPowerId: command.signingPowerId });
    if (!power) throw new SigningPowerNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: power.tenderId, permission: ClientPermission.ValidateAdministrativeDossier });

    const occurredAt = this.clock.now();
    power.verify({ verifiedBy: command.actorId, occurredAt });
    await this.repository.save(power);
    return toSigningPowerSummary(power, occurredAt);
  }
}

export type ListSigningPowersQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSigningPowersUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SIGNING_POWER_REPOSITORY) private readonly repository: SigningPowerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: ListSigningPowersQuery): Promise<readonly SigningPowerSummary[]> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const powers = await this.repository.listByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    const now = this.clock.now();
    return powers.map((p) => toSigningPowerSummary(p, now));
  }
}
