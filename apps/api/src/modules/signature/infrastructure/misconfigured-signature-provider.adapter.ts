import { SignatureProviderMisconfiguredError } from "../domain/errors";
import type { SignatureConfig } from "../application/ports/signature-config.port";
import type { SignatureProviderPort } from "../application/ports/signature-provider.port";
import type { SignatureWebhookVerifierPort, WebhookVerificationResult } from "../application/ports/signature-webhook-verifier.port";

/**
 * Mission Sprint 8A §37/§38 — "une mauvaise configuration doit provoquer une erreur claire plutôt
 * qu'un fallback silencieux vers le fake". L'application DOIT pouvoir démarrer même sans
 * `SIGNATURE_PROVIDER` défini (même discipline que `GenerationConfig`/`AnalysisConfig` — "jamais
 * une variable obligatoire au démarrage", pour ne jamais bloquer les modules déjà validés
 * Sprint 0-7 qui n'ont rien à voir avec la signature) : cet adaptateur substitut est lié quand la
 * configuration est absente/invalide, et échoue EXPLICITEMENT dès la première tentative
 * d'utilisation réelle, jamais silencieusement.
 */
export class MisconfiguredSignatureProviderAdapter implements SignatureProviderPort {
  readonly providerName = "MISCONFIGURED";

  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new SignatureProviderMisconfiguredError(this.reason);
  }

  async createTransaction(): Promise<never> {
    this.fail();
  }
  async uploadDocument(): Promise<never> {
    this.fail();
  }
  async addParticipant(): Promise<never> {
    this.fail();
  }
  async startTransaction(): Promise<never> {
    this.fail();
  }
  async getTransaction(): Promise<never> {
    this.fail();
  }
  async cancelTransaction(): Promise<never> {
    this.fail();
  }
  async downloadSignedDocument(): Promise<never> {
    this.fail();
  }
  async downloadEvidence(): Promise<never> {
    this.fail();
  }
}

export class MisconfiguredWebhookVerifier implements SignatureWebhookVerifierPort {
  constructor(private readonly reason: string) {}

  async verify(): Promise<WebhookVerificationResult> {
    throw new SignatureProviderMisconfiguredError(this.reason);
  }
}

/** Même discipline pour le port `SIGNATURE_CONFIG` (application) : la lecture de `.provider` est
 *  ce qui déclenche l'échec explicite, jamais l'injection elle-même (qui doit rester silencieuse
 *  pour ne pas empêcher l'API de démarrer). */
export class MisconfiguredSignatureConfig implements SignatureConfig {
  constructor(private readonly reason: string) {}

  get provider(): never {
    throw new SignatureProviderMisconfiguredError(this.reason);
  }
}
