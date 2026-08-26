import { describe, expect, it } from "vitest";
import { GOVERNED_WEBHOOK_EVENT_TYPES, resolvePublicEventType } from "../../integrations/domain/event-catalog";
import { scanProducedOutboxEventTypes, scanRegisteredHandlerEventTypes } from "../test-support/outbox-producer-scanner";
import { OUTBOX_EVENT_CATALOG, OUTBOX_EVENT_DESTINATIONS, findOutboxEventCatalogEntry, requiresInternalDelivery } from "./outbox-event-catalog";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3C : CONTRAT DE GOUVERNANCE du catalogue Outbox.
 *
 * FIX-3A a répondu « que signifie chaque eventType ? », FIX-3B « comment le runtime traite chaque
 * classification ? ». Ce fichier répond à la troisième question : « comment empêcher le code et le
 * catalogue de diverger à nouveau ? ».
 *
 * Il ne dépend d'AUCUN artefact de certification (§17) : la SSoT et le code courant suffisent.
 * Les messages d'échec nomment les eventTypes et leurs producteurs — le test doit être un outil de
 * gouvernance, pas seulement une lumière rouge (§16).
 */

const scan = scanProducedOutboxEventTypes();
const registeredHandlers = scanRegisteredHandlerEventTypes();
const catalogued = new Set(OUTBOX_EVENT_CATALOG.map((e) => e.eventType));

function describeSites(eventType: string): string {
  return (scan.producedEventTypes.get(eventType) ?? ["producteur inconnu"]).slice(0, 2).join(", ");
}

describe("CONTRAT — catalogue Outbox vs code réel (FIX-3C)", () => {
  it("BLOQUANT (§3/§15) — tout eventType PRODUIT est déclaré dans OUTBOX_EVENT_CATALOG", () => {
    const missing = [...scan.producedEventTypes.keys()].filter((t) => !catalogued.has(t));

    // Message de gouvernance : nommer les types ET leurs producteurs, jamais « 78 attendu, 80 reçu ».
    const report = missing.map((t) => `  - ${t}  (produit par ${describeSites(t)})`).join("\n");
    expect(missing, missing.length === 0 ? "" : `${missing.length} eventType(s) produit(s) absent(s) du catalogue :\n${report}\n\nDéclarez-les dans src/modules/outbox/domain/outbox-event-catalog.ts avec leur classification.`).toEqual([]);
  });

  it("BLOQUANT (§4/§5) — aucune forme de producteur n'échappe au scanner : une syntaxe inconnue échoue bruyamment", () => {
    // C'est la garantie qui rend le contrat digne de confiance : sans elle, un producteur écrit dans
    // une forme imprévue serait invisible — exactement l'angle mort qui avait produit l'écart 76→78.
    const report = scan.unrecognized.map((u) => `  - ${u.file}:${u.line}  =>  ${u.expression}`).join("\n");
    expect(scan.unrecognized, scan.unrecognized.length === 0 ? "" : `Forme(s) de production d'eventType non interprétable(s) :\n${report}\n\nÉtendez outbox-producer-scanner.ts pour les reconnaître.`).toEqual([]);
  });

  it("BLOQUANT — le catalogue ne déclare aucun type qui ne serait plus produit (dérive inverse)", () => {
    const orphans = [...catalogued].filter((t) => !scan.producedEventTypes.has(t));

    expect(orphans, orphans.length === 0 ? "" : `Type(s) catalogué(s) sans aucun producteur : ${orphans.join(", ")}. Retirez-les ou classez-les LEGACY.`).toEqual([]);
  });

  it("BLOQUANT (§6) — catalogue structurellement sain : aucun doublon, aucune entrée vide, aucune destination inconnue", () => {
    const seen = new Map<string, number>();
    for (const e of OUTBOX_EVENT_CATALOG) seen.set(e.eventType, (seen.get(e.eventType) ?? 0) + 1);

    expect([...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t)).toEqual([]);
    expect(OUTBOX_EVENT_CATALOG.filter((e) => !e.eventType || !e.module).map((e) => e.eventType)).toEqual([]);
    expect(OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.length === 0).map((e) => e.eventType)).toEqual([]);
    expect(OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.some((d) => !OUTBOX_EVENT_DESTINATIONS.includes(d))).map((e) => e.eventType)).toEqual([]);
  });

  it("BLOQUANT (§7) — tout type INTERNAL possède un handler enregistré : jamais toléré silencieusement", () => {
    const internalWithoutHandler = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("INTERNAL") && !registeredHandlers.has(e.eventType)).map(
      (e) => `  - ${e.eventType} (module ${e.module}, produit par ${describeSites(e.eventType)})`,
    );

    expect(internalWithoutHandler, internalWithoutHandler.length === 0 ? "" : `Type(s) INTERNAL sans handler enregistré :\n${internalWithoutHandler.join("\n")}\n\nSoit enregistrez le handler, soit reclassez l'événement.`).toEqual([]);
  });

  it("BLOQUANT (§8) — aucun handler inattendu sur un type ne requérant aucune livraison interne", () => {
    const contradictions = OUTBOX_EVENT_CATALOG.filter((e) => requiresInternalDelivery(e.eventType) === false && registeredHandlers.has(e.eventType)).map(
      (e) => `  - ${e.eventType} : catalogué ${e.destinations.join("+")} mais handler dans ${registeredHandlers.get(e.eventType)}`,
    );

    expect(contradictions, contradictions.length === 0 ? "" : `Contradiction(s) de gouvernance :\n${contradictions.join("\n")}`).toEqual([]);
  });

  it("BLOQUANT (§9) — tout type EXTERNAL_WEBHOOK est réellement reconnu par le pipeline Integration Hub", () => {
    const external = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("EXTERNAL_WEBHOOK"));

    // Réconciliation par le VRAI pont du produit (`resolvePublicEventType`), jamais par une liste
    // recopiée : c'est lui qui décide ce que l'Integration Hub expose réellement.
    const unbridged = external
      .filter((e) => resolvePublicEventType(e.eventType, { decision: "GO" }) === undefined)
      .map((e) => `  - ${e.eventType} (catalogué EXTERNAL_WEBHOOK mais inconnu de resolvePublicEventType)`);
    expect(unbridged, unbridged.length === 0 ? "" : unbridged.join("\n")).toEqual([]);

    // Et dans l'autre sens : chaque type public gouverné doit avoir un producteur catalogué.
    const covered = new Set(external.flatMap((e) => e.publicWebhookTypes ?? [e.eventType]));
    expect(GOVERNED_WEBHOOK_EVENT_TYPES.filter((p) => !covered.has(p))).toEqual([]);
  });

  it("BLOQUANT (§10) — une destination multiple est acceptée et impose LES DEUX obligations", () => {
    const multi = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.length > 1);

    for (const entry of multi) {
      if (entry.destinations.includes("INTERNAL")) expect(registeredHandlers.has(entry.eventType), `${entry.eventType} est INTERNAL : un handler est requis`).toBe(true);
      if (entry.destinations.includes("EXTERNAL_WEBHOOK")) expect(resolvePublicEventType(entry.eventType, { decision: "GO" }), `${entry.eventType} est EXTERNAL_WEBHOOK : un pont est requis`).toBeDefined();
    }
    // Aucun type multi-destination aujourd'hui : la gouvernance est néanmoins prête (F3-003 différé).
    expect(multi.map((e) => e.eventType)).toEqual([]);
  });

  it("(§18) — les eventType SYNTHÉTIQUES des tests ne polluent jamais le catalogue produit", () => {
    for (const synthetic of ["TEST_EVENT", "OWN_EVENT", "FOREIGN_EVENT", "H7_FOREIGN_EVENT"]) {
      expect(findOutboxEventCatalogEntry(synthetic), `${synthetic} ne doit pas figurer dans la SSoT produit`).toBeUndefined();
    }
  });

  it("(§13) — le drapeau de revue produit reste une information de gouvernance, jamais une règle runtime", () => {
    const flagged = OUTBOX_EVENT_CATALOG.filter((e) => e.productReviewSuggested);

    expect(flagged.length).toBeGreaterThan(0);
    // Il ne modifie AUCUN comportement : ces types restent traités comme leur classification l'exige.
    for (const entry of flagged) expect(requiresInternalDelivery(entry.eventType)).toBe(false);
  });
});
