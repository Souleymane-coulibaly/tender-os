import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import { DumeDeclaration } from "../../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../../domain/dume-declaration-version.entity";
import { DumeDeclarationNotFoundError } from "../../domain/errors";
import type { StructuredCapacityStatement } from "../../domain/structured-capacity-statement";
import { DumeDeclarationSummary, DumeDeclarationVersionSummary, toDumeDeclarationSummary, toDumeDeclarationVersionSummary } from "../dtos-structured";
import { DUME_DECLARATION_REPOSITORY, DUME_DECLARATION_VERSION_REPOSITORY, type DumeDeclarationRepository, type DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type EnsureDumeDeclarationCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §13 — même motif que DC2 (`EnsureDc2DeclarationUseCase`) : capture structurée
 *  uniquement, jamais un export XML ou un dépôt automatique prétendu. */
@Injectable()
export class EnsureDumeDeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DUME_DECLARATION_REPOSITORY) private readonly repository: DumeDeclarationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: EnsureDumeDeclarationCommand): Promise<DumeDeclarationSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §20 — point d'entrée INDÉPENDANT.
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => {
        const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
        if (existing) return toDumeDeclarationSummary(existing);

        const dume = DumeDeclaration.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, tenderId: command.tenderId, createdBy: command.actorId, occurredAt: this.clock.now() });
        await this.repository.create(dume);
        return toDumeDeclarationSummary(dume);
      },
    );
  }
}

export type CreateDumeDeclarationVersionCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; dumeDeclarationId: string; data: StructuredCapacityStatement }>;

@Injectable()
export class CreateDumeDeclarationVersionUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DUME_DECLARATION_REPOSITORY) private readonly declarationRepository: DumeDeclarationRepository,
    @Inject(DUME_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: DumeDeclarationVersionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDumeDeclarationVersionCommand): Promise<DumeDeclarationVersionSummary> {
    const declaration = await this.declarationRepository.findById({ organizationId: command.organizationId, dumeDeclarationId: command.dumeDeclarationId });
    if (!declaration) throw new DumeDeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: declaration.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    const nextVersionNumber = declaration.currentVersionNumber + 1;
    const version = DumeDeclarationVersion.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, dumeDeclarationId: declaration.id, version: nextVersionNumber, data: command.data, createdBy: command.actorId, occurredAt });
    await this.versionRepository.create(version);

    declaration.recordNewVersion({ versionNumber: nextVersionNumber, occurredAt });
    await this.declarationRepository.save(declaration);

    return toDumeDeclarationVersionSummary(version);
  }
}

export type GetDumeDeclarationQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetDumeDeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DUME_DECLARATION_REPOSITORY) private readonly declarationRepository: DumeDeclarationRepository,
    @Inject(DUME_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: DumeDeclarationVersionRepository,
  ) {}

  async execute(query: GetDumeDeclarationQuery): Promise<{ declaration: DumeDeclarationSummary; versions: readonly DumeDeclarationVersionSummary[] } | null> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const declaration = await this.declarationRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!declaration) return null;
    const versions = await this.versionRepository.listByDeclaration({ organizationId: query.organizationId, dumeDeclarationId: declaration.id });
    return { declaration: toDumeDeclarationSummary(declaration), versions: versions.map(toDumeDeclarationVersionSummary) };
  }
}
