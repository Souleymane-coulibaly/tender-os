import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import { AdministrativeDossierSummary, toAdministrativeDossierSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { DuplicateAdministrativeDossierError } from "../../domain/errors";

export type EnsureAdministrativeDossierCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Sprint 8C Phase 1 — mission §6 : un dossier administratif PRINCIPAL par Tender, création
 * idempotente. Une seule ligne, jamais une matérialisation de 9 types comme
 * `EnsureTenderDeliverablesUseCase` — le dossier est un agrégat unique. `@@unique([organizationId,
 * tenderId])` protège contre une double création concurrente ; sur violation, on se contente de
 * relire la ligne déjà créée (idempotence réelle, jamais une erreur exposée à l'appelant).
 */
@Injectable()
export class EnsureAdministrativeDossierUseCase {
  constructor(
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly repository: AdministrativeDossierRepository,
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: EnsureAdministrativeDossierCommand): Promise<AdministrativeDossierSummary> {
    const clientAccountId = await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      permission: ClientPermission.ReadAdministrativeDossier,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §20 (ENTITLEMENT COVERAGE) — correctif du bypass
    // Codex : ce use case (et `CreateAdministrativeRequirementUseCase`) sont les VRAIS points
    // d'entrée du module `administrative-dossier` (aucune autre mutation n'y requiert un dossier ou
    // une exigence préexistants) — peuvent donc être la PREMIÈRE mutation "cœur AO" sur un Tender
    // fraîchement créé. Allocation du Pass (si nécessaire) avec compensation automatique si
    // l'opération échoue ensuite (mission §2/§3/§4).
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command, clientAccountId),
    );
  }

  private async executeEntitled(command: EnsureAdministrativeDossierCommand, clientAccountId: string): Promise<AdministrativeDossierSummary> {
    const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (existing) {
      return toAdministrativeDossierSummary(existing);
    }

    const occurredAt = this.clock.now();
    const dossier = AdministrativeDossier.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId,
      tenderId: command.tenderId,
      occurredAt,
    });

    try {
      await this.repository.create(dossier);
    } catch (error) {
      if (error instanceof DuplicateAdministrativeDossierError) {
        const raceWinner = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
        if (raceWinner) return toAdministrativeDossierSummary(raceWinner);
      }
      throw error;
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ADMINISTRATIVE_DOSSIER_CREATED",
      resourceType: "ADMINISTRATIVE_DOSSIER",
      resourceId: dossier.id,
    });

    return toAdministrativeDossierSummary(dossier);
  }
}
