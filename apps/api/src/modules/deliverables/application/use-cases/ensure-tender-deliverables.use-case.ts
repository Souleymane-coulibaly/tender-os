import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableType, isStructuredDeliverableType } from "../../domain/deliverable-type";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import { TemplateThemeResolverService } from "../services/template-theme-resolver.service";

export type EnsureTenderDeliverablesCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

const ALL_DELIVERABLE_TYPES: readonly DeliverableType[] = Object.values(DeliverableType);

/**
 * Mission Sprint 8A.1 §3/§16 — "au minimum" un livrable par type dans chaque Tender. Idempotent :
 * appelé à chaque ouverture de la page Livrables, ne recrée jamais un livrable déjà existant
 * (`findByTenderAndType`). Pour les livrables structurés (Mémoire technique/Synthèse exécutive),
 * résout immédiatement le template/thème applicables (mission §5/§6) et matérialise les sections —
 * si aucun template n'est encore actif à aucun palier, le livrable reste sans section (mission
 * n'impose aucun contenu de repli inventé).
 */
@Injectable()
export class EnsureTenderDeliverablesUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly templateThemeResolver: TemplateThemeResolverService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: EnsureTenderDeliverablesCommand): Promise<readonly Deliverable[]> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ReadDeliverable,
    });

    const results: Deliverable[] = [];
    for (const type of ALL_DELIVERABLE_TYPES) {
      const existing = await this.deliverableRepository.findByTenderAndType({ organizationId: command.organizationId, tenderId: command.tenderId, type });
      if (existing) {
        results.push(existing);
        continue;
      }

      const occurredAt = this.clock.now();
      const deliverable = Deliverable.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        clientAccountId: tender.clientAccountId,
        tenderId: command.tenderId,
        type,
        createdBy: command.actorId,
        occurredAt,
      });

      if (isStructuredDeliverableType(type)) {
        const resolvedTemplate = await this.templateThemeResolver.resolveTemplate({
          organizationId: command.organizationId,
          clientAccountId: tender.clientAccountId,
          tenderId: command.tenderId,
          documentType: type,
        });
        const resolvedTheme = await this.templateThemeResolver.resolveTheme({
          organizationId: command.organizationId,
          clientAccountId: tender.clientAccountId,
          tenderId: command.tenderId,
        });
        if (resolvedTemplate) {
          deliverable.attachTemplate({ templateVersionId: resolvedTemplate.version.id, sourceLevel: resolvedTemplate.sourceLevel, occurredAt });
        }
        if (resolvedTheme) {
          deliverable.attachTheme({ themeVersionId: resolvedTheme.version.id, sourceLevel: resolvedTheme.sourceLevel, selectedBy: command.actorId, occurredAt });
        }

        await this.deliverableRepository.create(deliverable);

        if (resolvedTemplate) {
          const sections = resolvedTemplate.version.sections.map((sectionConfig) =>
            DeliverableSection.create({
              id: this.idGenerator.generate(),
              organizationId: command.organizationId,
              deliverableId: deliverable.id,
              code: sectionConfig.code,
              title: sectionConfig.title,
              order: sectionConfig.order,
              headingLevel: sectionConfig.headingLevel,
              mandatory: sectionConfig.requirement === "MANDATORY",
              occurredAt,
            }),
          );
          if (sections.length > 0) {
            await this.sectionRepository.createMany(sections);
          }
        }
      } else {
        await this.deliverableRepository.create(deliverable);
      }

      results.push(deliverable);
    }

    return results;
  }
}
