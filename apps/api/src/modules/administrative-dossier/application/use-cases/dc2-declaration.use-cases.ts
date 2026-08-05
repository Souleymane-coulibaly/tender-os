import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { Dc2Declaration } from "../../domain/dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "../../domain/dc2-declaration-version.entity";
import { Dc2DeclarationNotFoundError } from "../../domain/errors";
import type { StructuredCapacityStatement } from "../../domain/structured-capacity-statement";
import { Dc2DeclarationSummary, Dc2DeclarationVersionSummary, toDc2DeclarationSummary, toDc2DeclarationVersionSummary } from "../dtos-structured";
import { DC2_DECLARATION_REPOSITORY, DC2_DECLARATION_VERSION_REPOSITORY, type Dc2DeclarationRepository, type Dc2DeclarationVersionRepository } from "../ports/dc2-declaration.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type EnsureDc2DeclarationCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §11 — une déclaration DC2 par Tender, création idempotente (démarre sans version — la
 *  première version est créée explicitement via `CreateDc2DeclarationVersionUseCase`). */
@Injectable()
export class EnsureDc2DeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC2_DECLARATION_REPOSITORY) private readonly repository: Dc2DeclarationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: EnsureDc2DeclarationCommand): Promise<Dc2DeclarationSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });
    const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (existing) return toDc2DeclarationSummary(existing);

    const dc2 = Dc2Declaration.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, tenderId: command.tenderId, createdBy: command.actorId, occurredAt: this.clock.now() });
    await this.repository.create(dc2);
    return toDc2DeclarationSummary(dc2);
  }
}

export type CreateDc2DeclarationVersionCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; dc2DeclarationId: string; data: StructuredCapacityStatement }>;

/** Mission §11 — "les données utilisées dans une révision validée doivent rester reproductibles" :
 *  chaque appel crée une NOUVELLE version immuable, jamais une modification de la précédente. */
@Injectable()
export class CreateDc2DeclarationVersionUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC2_DECLARATION_REPOSITORY) private readonly declarationRepository: Dc2DeclarationRepository,
    @Inject(DC2_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: Dc2DeclarationVersionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDc2DeclarationVersionCommand): Promise<Dc2DeclarationVersionSummary> {
    const declaration = await this.declarationRepository.findById({ organizationId: command.organizationId, dc2DeclarationId: command.dc2DeclarationId });
    if (!declaration) throw new Dc2DeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: declaration.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    const nextVersionNumber = declaration.currentVersionNumber + 1;
    const version = Dc2DeclarationVersion.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, dc2DeclarationId: declaration.id, version: nextVersionNumber, data: command.data, createdBy: command.actorId, occurredAt });
    await this.versionRepository.create(version);

    declaration.recordNewVersion({ versionNumber: nextVersionNumber, occurredAt });
    await this.declarationRepository.save(declaration);

    return toDc2DeclarationVersionSummary(version);
  }
}

export type GetDc2DeclarationQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetDc2DeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC2_DECLARATION_REPOSITORY) private readonly declarationRepository: Dc2DeclarationRepository,
    @Inject(DC2_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: Dc2DeclarationVersionRepository,
  ) {}

  async execute(query: GetDc2DeclarationQuery): Promise<{ declaration: Dc2DeclarationSummary; versions: readonly Dc2DeclarationVersionSummary[] } | null> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const declaration = await this.declarationRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!declaration) return null;
    const versions = await this.versionRepository.listByDeclaration({ organizationId: query.organizationId, dc2DeclarationId: declaration.id });
    return { declaration: toDc2DeclarationSummary(declaration), versions: versions.map(toDc2DeclarationVersionSummary) };
  }
}
