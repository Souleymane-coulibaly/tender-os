import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import { toDceSummary, type DceSummary } from "../dtos";

export type GetDceByTenderQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string }>;

/** Lecture seule — un 404 signifie "aucun DCE initialisé pour ce Tender", ce que le frontend
 *  interprète comme "afficher l'action d'initialisation" plutôt qu'une erreur.
 *
 * Mission Sprint 8A.2 (audit isolation inter-client, Cockpit Bid Manager) — appelle désormais
 * `GetTenderUseCase` avec `actorId` AVANT toute lecture DCE : sans cela, `assertHasDcePermission`
 * ne vérifiait que le rôle ORG-WIDE de l'acteur, jamais son affectation au CLIENT propriétaire de
 * ce Tender précis (`AssertClientAccessUseCase`, déclenché uniquement quand `actorId` est fourni,
 * voir `GetTenderUseCase.execute`) — un acteur CONTRIBUTOR/REVIEWER non affecté au client pouvait
 * lire le DCE de N'IMPORTE QUEL Tender de l'organisation, pas seulement ceux de ses propres
 * clients. Découvert en auditant l'isolation inter-client (mission §"isolation multi-tenant"). */
@Injectable()
export class GetDceUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: GetDceByTenderQuery): Promise<DceSummary> {
    assertHasDcePermission(query.actorRole, DcePermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

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
