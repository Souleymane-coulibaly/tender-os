import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";

export type CompareRevisionsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  fromRevisionId: string;
  toRevisionId: string;
}>;

export type RevisionComparison = Readonly<{
  from: DeliverableRevisionSummary;
  to: DeliverableRevisionSummary;
  /** Diff PARAGRAPHE/BLOC : comparaison de l'équivalent texte brut, ligne par ligne, jamais du HTML
   *  rendu (mission §12 "affiche : ajouts, suppressions, modifications, auteur, date, numéro de
   *  version"). Lecture seule — ne modifie jamais ni `from` ni `to`. */
  addedLines: readonly string[];
  removedLines: readonly string[];
}>;

/** Mission Sprint 8A.1 §12 — comparaison en LECTURE SEULE de deux révisions de la MÊME section
 *  (génération IA vs révision humaine, deux révisions humaines, ou version validée vs nouveau
 *  brouillon). */
@Injectable()
export class CompareRevisionsUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
  ) {}

  async execute(query: CompareRevisionsQuery): Promise<RevisionComparison> {
    const { section } = await this.accessService.loadSectionContext({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      deliverableSectionId: query.deliverableSectionId,
      permission: ClientPermission.ReadDeliverable,
    });

    const [from, to] = await Promise.all([
      this.revisionRepository.findById({ organizationId: query.organizationId, revisionId: query.fromRevisionId }),
      this.revisionRepository.findById({ organizationId: query.organizationId, revisionId: query.toRevisionId }),
    ]);
    if (!from || from.deliverableSectionId !== section.id || !to || to.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }

    const fromLines = from.contentText.split("\n").filter((l) => l.length > 0);
    const toLines = to.contentText.split("\n").filter((l) => l.length > 0);
    const fromSet = new Set(fromLines);
    const toSet = new Set(toLines);

    return {
      from: toDeliverableRevisionSummary(from),
      to: toDeliverableRevisionSummary(to),
      addedLines: toLines.filter((l) => !fromSet.has(l)),
      removedLines: fromLines.filter((l) => !toSet.has(l)),
    };
  }
}
