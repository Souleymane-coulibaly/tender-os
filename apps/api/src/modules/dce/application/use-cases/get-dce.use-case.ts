import { Inject, Injectable } from "@nestjs/common";
import { DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import { toDceSummary, type DceSummary } from "../dtos";

export type GetDceByTenderQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

/** Lecture seule — un 404 signifie "aucun DCE initialisé pour ce Tender", ce que le frontend
 *  interprète comme "afficher l'action d'initialisation" plutôt qu'une erreur. */
@Injectable()
export class GetDceUseCase {
  constructor(@Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository) {}

  async execute(query: GetDceByTenderQuery): Promise<DceSummary> {
    assertHasDcePermission(query.actorRole, DcePermission.Read);

    const dce = await this.dceRepository.findByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!dce) {
      throw new DceNotFoundError();
    }

    return toDceSummary(dce);
  }
}
