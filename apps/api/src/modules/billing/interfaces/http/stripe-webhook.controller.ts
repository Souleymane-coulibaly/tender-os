import { Controller, Headers, HttpCode, HttpStatus, Post, Req, UseFilters } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { StripeWebhookSignatureInvalidError } from "../../domain/errors";
import { HandleStripeWebhookUseCase } from "../../application/use-cases/handle-stripe-webhook.use-case";
import { BillingErrorFilter } from "./billing-error.filter";

/**
 * V2 Sprint 22 (billing, étape 22C) — route DÉDIÉE, jamais authentifiée par session TenderOS (même
 * motif que `SignatureWebhookController`, module `signature`) : sa seule garantie d'authenticité
 * est la vérification cryptographique Stripe sur le corps HTTP BRUT (`req.rawBody`, `rawBody: true`
 * déjà activé globalement dans `main.ts`), jamais le JSON déjà désérialisé par un `@Body()`
 * classique.
 */
@Controller("webhooks/stripe")
@UseFilters(BillingErrorFilter)
export class StripeWebhookController {
  constructor(private readonly handleStripeWebhookUseCase: HandleStripeWebhookUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signatureHeader?: string): Promise<{ received: true }> {
    if (!req.rawBody || !signatureHeader) {
      throw new StripeWebhookSignatureInvalidError();
    }
    await this.handleStripeWebhookUseCase.execute({ rawBody: req.rawBody, signatureHeader });
    return { received: true };
  }
}
