import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOVERNED_WEBHOOK_EVENT_TYPES } from "../../integrations/domain/event-catalog";
import { findOutboxEventCatalogEntry, hasDestination, OUTBOX_EVENT_CATALOG, OUTBOX_EVENT_DESTINATIONS } from "./outbox-event-catalog";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3A : tests du CATALOGUE uniquement.
 *
 * Ils vérifient la cohérence interne de la Source of Truth et sa réconciliation avec les deux
 * autres sources existantes (handlers enregistrés, catalogue webhook gouverné). Le test contractuel
 * qui BLOQUERA un producteur introduisant un type non catalogué appartient à FIX-3C — délibérément
 * absent ici.
 */

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts")) acc.push(p.replace(/\\/g, "/"));
  }
  return acc;
}

const SOURCE_FILES = walk("src").filter((f) => !f.includes(".spec.") && !f.includes("/test-support/"));

/** Handlers réellement déclarés dans le code (`readonly eventType = "…"`) — jamais une liste
 *  recopiée à la main, qui pourrait diverger silencieusement du code. */
const REGISTERED_HANDLER_EVENT_TYPES = new Set<string>(
  SOURCE_FILES.filter((f) => f.includes("/outbox-handlers/")).flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/readonly\s+eventType\s*[:=]\s*"([A-Za-z0-9_.]+)"/g)].map((m) => m[1]!),
  ),
);

describe("OUTBOX_EVENT_CATALOG — FIX-3A (Source of Truth déclarative)", () => {
  it("BLOQUANT — aucun eventType dupliqué : une classification contradictoire serait indétectable au runtime", () => {
    const seen = new Map<string, number>();
    for (const entry of OUTBOX_EVENT_CATALOG) seen.set(entry.eventType, (seen.get(entry.eventType) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([eventType]) => eventType);

    expect(duplicates).toEqual([]);
  });

  it("BLOQUANT — chaque entrée déclare au moins une destination, toutes valides (jamais OTHER/NONE/UNKNOWN)", () => {
    const invalid = OUTBOX_EVENT_CATALOG.filter(
      (e) => e.destinations.length === 0 || e.destinations.some((d) => !OUTBOX_EVENT_DESTINATIONS.includes(d)),
    ).map((e) => e.eventType);

    expect(invalid).toEqual([]);
  });

  it("BLOQUANT — réconciliation HANDLERS : tout eventType possédant un handler enregistré est catalogué INTERNAL ou EXTERNAL_WEBHOOK", () => {
    const misclassified = [...REGISTERED_HANDLER_EVENT_TYPES].filter(
      (eventType) => !hasDestination(eventType, "INTERNAL") && !hasDestination(eventType, "EXTERNAL_WEBHOOK"),
    );

    // Un handler existe : l'événement ne peut pas être une simple trace.
    expect(misclassified).toEqual([]);
    expect(REGISTERED_HANDLER_EVENT_TYPES.size).toBe(30);
  });

  it("BLOQUANT — réconciliation WEBHOOKS : chaque type public gouverné est produit par un eventType catalogué EXTERNAL_WEBHOOK", () => {
    const externalEntries = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("EXTERNAL_WEBHOOK"));
    // La couverture se verifie sur les types PUBLICS, jamais par un comptage 1:1 : un meme
    // evenement interne peut en alimenter plusieurs — `GoNoGoDecisionRecorded` resout vers
    // `opportunity.go_decided` OU `opportunity.no_go_decided` selon la decision portee par le
    // payload (`resolvePublicEventType`). C'est precisement ce que ce test a revele.
    const covered = new Set(externalEntries.flatMap((e) => e.publicWebhookTypes ?? [e.eventType]));
    const uncovered = GOVERNED_WEBHOOK_EVENT_TYPES.filter((publicType) => !covered.has(publicType));

    expect(uncovered).toEqual([]);
    expect(covered.size).toBe(GOVERNED_WEBHOOK_EVENT_TYPES.length);
  });

  it("BLOQUANT — aucun eventType classé AUDIT_ONLY ne possède de handler interne (contradiction de gouvernance)", () => {
    const contradictions = OUTBOX_EVENT_CATALOG.filter(
      (e) => e.destinations.includes("AUDIT_ONLY") && REGISTERED_HANDLER_EVENT_TYPES.has(e.eventType),
    ).map((e) => e.eventType);

    expect(contradictions).toEqual([]);
  });

  it("un type non catalogué renvoie undefined — jamais une classification par défaut", () => {
    expect(findOutboxEventCatalogEntry("TotallyUnknownEventType")).toBeUndefined();
    expect(hasDestination("TotallyUnknownEventType", "AUDIT_ONLY")).toBe(false);
  });

  it("le catalogue couvre les 78 eventTypes réellement produits, handlers et traces confondus", () => {
    const internal = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("INTERNAL")).length;
    const external = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("EXTERNAL_WEBHOOK")).length;
    const auditOnly = OUTBOX_EVENT_CATALOG.filter((e) => e.destinations.includes("AUDIT_ONLY")).length;

    expect(OUTBOX_EVENT_CATALOG).toHaveLength(78);
    expect(internal + external).toBe(30);
    expect(auditOnly).toBe(48);
  });

  it("les événements signalés pour revue produit sont explicitement marqués, jamais confondus avec de simples traces", () => {
    const flagged = OUTBOX_EVENT_CATALOG.filter((e) => e.productReviewSuggested).map((e) => e.eventType).sort();

    expect(flagged).toEqual(["CommentAdded", "PassReservationReleased", "PassReservedForTender", "TenderParticipantAdded", "TenderParticipantRemoved"]);
    // Ils restent AUDIT_ONLY tant qu'aucune décision produit ne les promeut.
    for (const eventType of flagged) expect(hasDestination(eventType, "AUDIT_ONLY")).toBe(true);
  });
});
