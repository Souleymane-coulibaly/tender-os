import { Controller, Headers, HttpCode, HttpStatus, Post, Req, UseFilters } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { SIGNATURE_PROVIDER } from "../../domain/signature-level";
import { WebhookSignatureInvalidError } from "../../domain/errors";
import { HandleSignatureProviderEventUseCase } from "../../application/use-cases/handle-signature-provider-event.use-case";
import { SignatureErrorFilter } from "./signature-error.filter";

/**
 * Mission Sprint 8A bis §39/§44/§45 — route DÉDIÉE, séparée de `SignatureController` : reçue
 * SANS authentification applicative (Universign ne porte pas de session TenderOS), sa seule
 * garantie d'authenticité est la vérification cryptographique de la JWS détachée
 * (`x-jws-signature`) faite par `HandleSignatureProviderEventUseCase` sur le corps HTTP BRUT —
 * jamais sur le JSON déjà désérialisé par un `@Body()` classique (mission §44 "jamais confiance
 * dans le seul JSON"). Le corps brut est disponible via `req.rawBody` grâce à
 * `NestFactory.create(AppModule, { rawBody: true })` (voir `main.ts`).
 */
@Controller("webhooks/universign")
@UseFilters(SignatureErrorFilter)
export class SignatureWebhookController {
  constructor(private readonly handleSignatureProviderEventUseCase: HandleSignatureProviderEventUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers("x-jws-signature") signatureHeader?: string): Promise<{ received: true }> {
    if (!req.rawBody || !signatureHeader) {
      throw new WebhookSignatureInvalidError();
    }
    await this.handleSignatureProviderEventUseCase.execute({
      provider: SIGNATURE_PROVIDER.Universign,
      rawBody: req.rawBody,
      signatureHeader,
    });
    return { received: true };
  }
}
