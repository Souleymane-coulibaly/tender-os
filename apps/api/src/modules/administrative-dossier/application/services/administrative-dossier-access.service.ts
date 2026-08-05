import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import type { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import { AdministrativeDossierNotFoundError } from "../../domain/errors";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";

/**
 * Sprint 8C Phase 1 — point d'entrée UNIQUE pour charger le dossier administratif avec vérification
 * RBAC + tenant + client, même motif que `DeliverableAccessService` (mission "ne duplique jamais
 * du code").
 */
@Injectable()
export class AdministrativeDossierAccessService {
  constructor(
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async loadDossier(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    dossierId: string;
    permission: ClientPermission;
  }): Promise<{ dossier: AdministrativeDossier; clientAccountId: string }> {
    const dossier = await this.dossierRepository.findById({ organizationId: input.organizationId, dossierId: input.dossierId });
    if (!dossier) {
      throw new AdministrativeDossierNotFoundError();
    }
    const clientAccountId = await this.assertTenderAccess({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      tenderId: dossier.tenderId,
      permission: input.permission,
    });
    return { dossier, clientAccountId };
  }

  async loadDossierByTenderId(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    tenderId: string;
    permission: ClientPermission;
  }): Promise<{ dossier: AdministrativeDossier; clientAccountId: string }> {
    const clientAccountId = await this.assertTenderAccess(input);
    const dossier = await this.dossierRepository.findByTenderId({ organizationId: input.organizationId, tenderId: input.tenderId });
    if (!dossier) {
      throw new AdministrativeDossierNotFoundError();
    }
    return { dossier, clientAccountId };
  }

  /** Vérifie l'accès au Tender SANS exiger qu'un dossier existe déjà — utilisé par
   *  `EnsureAdministrativeDossierUseCase` (mission §6 "création idempotente"). */
  async assertTenderAccess(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; permission: ClientPermission }): Promise<string> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return tender.clientAccountId;
  }
}
