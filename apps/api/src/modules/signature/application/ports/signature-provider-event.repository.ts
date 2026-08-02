import type { SignatureProviderEvent } from "../../domain/signature-provider-event";

export interface SignatureProviderEventRepository {
  /** Mission §45 — idempotence : retourne `false` si `(provider, providerEventId)` existe déjà
   *  (contrainte unique), sans jamais lever d'exception pour ce cas attendu. */
  tryRecord(event: SignatureProviderEvent): Promise<boolean>;
  markProcessed(input: { id: string; occurredAt: Date }): Promise<void>;
  markRejected(input: { id: string; errorCode: string }): Promise<void>;
}

export const SIGNATURE_PROVIDER_EVENT_REPOSITORY = Symbol("SIGNATURE_PROVIDER_EVENT_REPOSITORY");
