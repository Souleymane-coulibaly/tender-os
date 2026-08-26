import { requiresInternalDelivery } from "../../domain/outbox-event-catalog";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B. Répond à UNE seule question, au seul endroit du
 * pipeline qui a besoin de la poser : « l'absence de handler pour ce type est-elle une erreur ? ».
 *
 * Existe en tant que port injectable — et non en appel direct au catalogue — pour une raison
 * précise : plusieurs suites d'intégration déclarent des `eventType` SYNTHÉTIQUES
 * (`OWN_EVENT`/`FOREIGN_EVENT`…) qui n'ont, à juste titre, aucune place dans le catalogue produit.
 * Sans ce port, elles devraient soit polluer la SSoT avec des types fictifs, soit renoncer à
 * exercer le vrai dispatcher. Le port leur permet de déclarer explicitement la classification de
 * leurs fixtures, sans que la production cesse une seule seconde de dériver du catalogue réel.
 */
export interface OutboxEventDeliveryPolicy {
  /** `undefined` = type NON catalogué : l'appelant doit lever une erreur de gouvernance, jamais
   *  supposer qu'aucune livraison n'est requise. */
  requiresInternalDelivery(eventType: string): boolean | undefined;
}

export const OUTBOX_EVENT_DELIVERY_POLICY = Symbol("OUTBOX_EVENT_DELIVERY_POLICY");

/** Politique de PRODUCTION : dérivée intégralement d'`OUTBOX_EVENT_CATALOG`, jamais d'une seconde
 *  liste. C'est la valeur par défaut du dispatcher — aucune configuration n'est requise pour que le
 *  runtime respecte la SSoT. */
export const CATALOG_OUTBOX_EVENT_DELIVERY_POLICY: OutboxEventDeliveryPolicy = { requiresInternalDelivery };
