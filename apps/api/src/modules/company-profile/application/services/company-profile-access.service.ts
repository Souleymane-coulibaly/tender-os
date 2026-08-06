import { Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase, type ClientAccountSummary } from "../../../client-portfolio";

/**
 * Point d'entrée UNIQUE pour vérifier organisation+accès client avant toute action sur le profil
 * "Entreprise candidate" — même motif que `SubmissionAccessService`/`AdministrativeDossierAccessService`
 * (mission §7 "toute requête doit vérifier organizationId et l'accès au ClientAccount").
 */
@Injectable()
export class CompanyProfileAccessService {
  constructor(
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async assertClientAccess(input: { organizationId: string; actorId: string; actorRole: string; clientAccountId: string; permission: ClientPermission }): Promise<ClientAccountSummary> {
    const client = await this.getClientAccountUseCase.execute({ organizationId: input.organizationId, clientAccountId: input.clientAccountId, actorId: input.actorId, actorRole: input.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return client;
  }
}
