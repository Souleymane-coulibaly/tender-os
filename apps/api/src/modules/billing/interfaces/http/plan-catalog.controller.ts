import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { GetPublicPlanCatalogUseCase } from "../../application/use-cases/get-public-plan-catalog.use-case";

/**
 * V2 Sprint 23 (landing) — route PUBLIQUE, jamais authentifiée (aucun `@UseGuards`, même motif que
 * `StripeWebhookController` pour "pas de session TenderOS requise") : la Landing Page (aucun
 * compte, mission §2) doit pouvoir afficher les tarifs réels sans dupliquer le catalogue.
 */
@Controller("billing/plan-catalog")
export class PlanCatalogController {
  constructor(private readonly getPublicPlanCatalogUseCase: GetPublicPlanCatalogUseCase) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  list() {
    return { items: this.getPublicPlanCatalogUseCase.execute() };
  }
}
