import { Injectable } from "@nestjs/common";
import { toDeliverableSummary, type DeliverableSummary } from "../dtos";
import { EnsureTenderDeliverablesUseCase } from "./ensure-tender-deliverables.use-case";

export type ListDeliverablesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §16 — la page Livrables affiche toujours les 9 livrables minimum, même si aucun n'a
 *  encore été travaillé (initialisation idempotente via `EnsureTenderDeliverablesUseCase`). */
@Injectable()
export class ListDeliverablesUseCase {
  constructor(private readonly ensureTenderDeliverablesUseCase: EnsureTenderDeliverablesUseCase) {}

  async execute(query: ListDeliverablesQuery): Promise<readonly DeliverableSummary[]> {
    const deliverables = await this.ensureTenderDeliverablesUseCase.execute(query);
    return deliverables.map((d) => toDeliverableSummary(d));
  }
}
