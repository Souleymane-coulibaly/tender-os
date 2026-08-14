import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { SubmitDemoRequestUseCase } from "../../application/use-cases/submit-demo-request.use-case";
import { DemoRequestThrottlerGuard } from "./demo-request-throttler.guard";
import { SubmitDemoRequestBodySchema, type SubmitDemoRequestBody } from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * V2 Sprint 23 (landing) — route PUBLIQUE (aucun `@UseGuards` d'authentification, même motif que
 * `PlanCatalogController`/`StripeWebhookController`), protégée uniquement par
 * `DemoRequestThrottlerGuard` (mission §27 "protection anti-spam raisonnable").
 */
@Controller("marketing/demo-requests")
export class DemoRequestController {
  constructor(private readonly submitDemoRequestUseCase: SubmitDemoRequestUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(DemoRequestThrottlerGuard)
  async submit(@Body(new ZodValidationPipe(SubmitDemoRequestBodySchema)) body: SubmitDemoRequestBody): Promise<{ success: true }> {
    await this.submitDemoRequestUseCase.execute({
      name: body.name,
      email: body.email,
      company: body.company,
      phone: body.phone,
      message: body.message,
      honeypot: body.website,
    });
    return { success: true };
  }
}
