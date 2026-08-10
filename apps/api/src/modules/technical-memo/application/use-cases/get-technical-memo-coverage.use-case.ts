import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { TechnicalMemoCoverageStatus } from "../../domain/enums";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import {
  TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY,
  type TechnicalMemoSectionRequirementRepository,
} from "../ports/technical-memo-section-requirement.repository";

export type GetTechnicalMemoCoverageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; technicalMemoId: string }>;

export type TechnicalMemoCoverageResult = Readonly<{
  totalRequirements: number;
  covered: number;
  partiallyCovered: number;
  notCovered: number;
  notApplicable: number;
  needsReview: number;
  /** Ratio simple, calculé, jamais présenté seul comme une note de qualité (mission §43 "coverage ≠
   *  score de qualité") — l'appelant (frontend) doit toujours l'accompagner d'une explication. */
  coverageRatio: number;
}>;

/**
 * Agrégation en LECTURE SEULE (mission §43-47) — recalculée à chaque appel à partir de l'état
 * PERSISTÉ des `TechnicalMemoSectionRequirement` (mis à jour par `GenerateTechnicalMemoSectionUseCase`
 * après chaque génération, ou par une correction manuelle utilisateur), jamais un score IA recalculé
 * à la volée par similarité (mission §47 "jamais une similarité vectorielle ne prouve légalement la
 * couverture").
 */
@Injectable()
export class GetTechnicalMemoCoverageUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(query: GetTechnicalMemoCoverageQuery): Promise<TechnicalMemoCoverageResult> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: query.organizationId,
      technicalMemoId: query.technicalMemoId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });

    const links = await this.requirementRepository.listByMemoId({ organizationId: query.organizationId, technicalMemoId: memo.id });

    const counts = {
      covered: 0,
      partiallyCovered: 0,
      notCovered: 0,
      notApplicable: 0,
      needsReview: 0,
    };
    for (const link of links) {
      switch (link.coverageStatus) {
        case TechnicalMemoCoverageStatus.Covered:
          counts.covered++;
          break;
        case TechnicalMemoCoverageStatus.PartiallyCovered:
          counts.partiallyCovered++;
          break;
        case TechnicalMemoCoverageStatus.NotCovered:
          counts.notCovered++;
          break;
        case TechnicalMemoCoverageStatus.NotApplicable:
          counts.notApplicable++;
          break;
        default:
          counts.needsReview++;
      }
    }

    const applicable = links.length - counts.notApplicable;

    return {
      totalRequirements: links.length,
      covered: counts.covered,
      partiallyCovered: counts.partiallyCovered,
      notCovered: counts.notCovered,
      notApplicable: counts.notApplicable,
      needsReview: counts.needsReview,
      coverageRatio: applicable > 0 ? counts.covered / applicable : 0,
    };
  }
}
