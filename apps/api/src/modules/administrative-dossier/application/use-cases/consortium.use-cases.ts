import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { Consortium, type ConsortiumMember, type ConsortiumType } from "../../domain/consortium.aggregate";
import { ConsortiumNotFoundError } from "../../domain/errors";
import { ConsortiumSummary, toConsortiumSummary } from "../dtos-structured";
import { CONSORTIUM_REPOSITORY, type ConsortiumRepository } from "../ports/consortium.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type EnsureConsortiumCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; type: ConsortiumType }>;

/** Mission §15 — un groupement par Tender, création idempotente (même motif que
 *  `EnsureAdministrativeDossierUseCase`). */
@Injectable()
export class EnsureConsortiumUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(CONSORTIUM_REPOSITORY) private readonly repository: ConsortiumRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: EnsureConsortiumCommand): Promise<ConsortiumSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (existing) return toConsortiumSummary(existing);

    const consortium = Consortium.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, tenderId: command.tenderId, type: command.type, createdBy: command.actorId, occurredAt: this.clock.now() });
    await this.repository.create(consortium);
    return toConsortiumSummary(consortium);
  }
}

export type UpdateConsortiumCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  consortiumId: string;
  type?: ConsortiumType | undefined;
  legalForm?: string | undefined;
  liabilityMode?: string | undefined;
  members?: readonly ConsortiumMember[] | undefined;
  mandataireMemberId?: string | undefined;
}>;

@Injectable()
export class UpdateConsortiumUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(CONSORTIUM_REPOSITORY) private readonly repository: ConsortiumRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateConsortiumCommand): Promise<ConsortiumSummary> {
    const consortium = await this.repository.findById({ organizationId: command.organizationId, consortiumId: command.consortiumId });
    if (!consortium) throw new ConsortiumNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: consortium.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    if (command.type !== undefined || command.legalForm !== undefined || command.liabilityMode !== undefined) {
      consortium.update({ type: command.type, legalForm: command.legalForm, liabilityMode: command.liabilityMode, occurredAt });
    }
    if (command.members !== undefined) {
      consortium.setMembers({ members: command.members, occurredAt });
    }
    if (command.mandataireMemberId !== undefined) {
      consortium.setMandataire({ mandataireMemberId: command.mandataireMemberId, occurredAt });
    }
    await this.repository.save(consortium);
    return toConsortiumSummary(consortium);
  }
}

export type GetConsortiumQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetConsortiumUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(CONSORTIUM_REPOSITORY) private readonly repository: ConsortiumRepository,
  ) {}

  async execute(query: GetConsortiumQuery): Promise<ConsortiumSummary | null> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const consortium = await this.repository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    return consortium ? toConsortiumSummary(consortium) : null;
  }
}
