import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { Dc1CandidateType, Dc1Declaration } from "../../domain/dc1-declaration.aggregate";
import { Dc1DeclarationNotFoundError } from "../../domain/errors";
import { Dc1DeclarationSummary, toDc1DeclarationSummary } from "../dtos-structured";
import { DC1_DECLARATION_REPOSITORY, type Dc1DeclarationRepository } from "../ports/dc1-declaration.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type EnsureDc1DeclarationCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §10 — une lettre de candidature par Tender, création idempotente (démarre INDIVIDUAL
 *  par défaut, ajustable ensuite via `UpdateDc1DeclarationUseCase`). */
@Injectable()
export class EnsureDc1DeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC1_DECLARATION_REPOSITORY) private readonly repository: Dc1DeclarationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: EnsureDc1DeclarationCommand): Promise<Dc1DeclarationSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (existing) return toDc1DeclarationSummary(existing);

    const dc1 = Dc1Declaration.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, tenderId: command.tenderId, candidateType: Dc1CandidateType.Individual, createdBy: command.actorId, occurredAt: this.clock.now() });
    await this.repository.create(dc1);
    return toDc1DeclarationSummary(dc1);
  }
}

export type UpdateDc1DeclarationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  dc1DeclarationId: string;
  candidateType?: Dc1CandidateType | undefined;
  consortiumId?: string | undefined;
  declarations?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  signingPowerId?: string | undefined;
  administrativeDocumentId?: string | undefined;
  exclusionAttestation?: boolean | undefined;
}>;

@Injectable()
export class UpdateDc1DeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC1_DECLARATION_REPOSITORY) private readonly repository: Dc1DeclarationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateDc1DeclarationCommand): Promise<Dc1DeclarationSummary> {
    const dc1 = await this.repository.findById({ organizationId: command.organizationId, dc1DeclarationId: command.dc1DeclarationId });
    if (!dc1) throw new Dc1DeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: dc1.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    dc1.update({
      candidateType: command.candidateType,
      consortiumId: command.consortiumId,
      declarations: command.declarations,
      signatoryName: command.signatoryName,
      signatoryCapacity: command.signatoryCapacity,
      signingPowerId: command.signingPowerId,
      exclusionAttestation: command.exclusionAttestation,
      occurredAt,
    });
    if (command.administrativeDocumentId !== undefined) {
      dc1.linkDocument({ administrativeDocumentId: command.administrativeDocumentId, occurredAt });
    }
    await this.repository.save(dc1);
    return toDc1DeclarationSummary(dc1);
  }
}

export type GetDc1DeclarationQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetDc1DeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC1_DECLARATION_REPOSITORY) private readonly repository: Dc1DeclarationRepository,
  ) {}

  async execute(query: GetDc1DeclarationQuery): Promise<Dc1DeclarationSummary | null> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const dc1 = await this.repository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    return dc1 ? toDc1DeclarationSummary(dc1) : null;
  }
}
