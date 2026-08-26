/**
 * FIX-3A — reconstruit la matrice exhaustive des eventTypes Outbox produits.
 *
 * Le balayage LITTÉRAL seul est insuffisant : l'audit FIX-3 a montré qu'il rate les producteurs
 * conditionnels (ternaires, champs `outboxEventType*` passés à un service générique). Ce script
 * combine donc trois sources et les recoupe, plutôt que de maintenir une liste manuelle (§6).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p.replace(/\\/g, "/"));
  }
})(SRC);

const isSpec = (f) => f.includes(".spec.") || f.includes("/test-support/");
const moduleOf = (f) => (f.startsWith("src/modules/") ? f.split("/")[2] : f.startsWith("src/shared-kernel") ? "shared-kernel" : "-");

const producers = new Map(); // eventType -> Set("file:line")
const handlers = new Map(); // eventType -> file

function addProducer(et, file, line) {
  if (!producers.has(et)) producers.set(et, new Set());
  producers.get(et).add(`${file}:${line}`);
}

for (const f of files) {
  if (isSpec(f)) continue;
  const s = readFileSync(f, "utf8");
  const lineAt = (i) => s.slice(0, i).split("\n").length;

  // (1) Handlers : `readonly eventType = "X"`.
  for (const m of s.matchAll(/readonly\s+eventType\s*[:=]\s*"([A-Za-z0-9_.]+)"/g)) handlers.set(m[1], f);

  // (2) Producteurs littéraux : `eventType: "X"` hors déclaration de handler.
  for (const m of s.matchAll(/eventType:\s*"([A-Za-z0-9_.]+)"/g)) {
    if (f.includes("/outbox-handlers/")) continue;
    addProducer(m[1], f, lineAt(m.index));
  }

  // (3) Producteurs CONDITIONNELS : ternaires `eventType: cond ? "A" : "B"`, et les champs
  //     `outboxEventTypeCompleted/Failed: "X"` consommés par un runner générique.
  for (const m of s.matchAll(/eventType:\s*[^,\n]*\?\s*"([A-Za-z0-9_.]+)"\s*:\s*"([A-Za-z0-9_.]+)"/g)) {
    addProducer(m[1], f, lineAt(m.index));
    addProducer(m[2], f, lineAt(m.index));
  }
  for (const m of s.matchAll(/outboxEventType(?:Completed|Failed):\s*"([A-Za-z0-9_.]+)"/g)) addProducer(m[1], f, lineAt(m.index));
  // (4) Helper `recordOutboxEvent(org, "X", …)` — motif du module analysis.
  for (const m of s.matchAll(/recordOutboxEvent\([^,]+,\s*[^,]*\?\s*"([A-Za-z0-9_.]+)"\s*:\s*"([A-Za-z0-9_.]+)"/g)) {
    addProducer(m[1], f, lineAt(m.index));
    addProducer(m[2], f, lineAt(m.index));
  }
  for (const m of s.matchAll(/recordOutboxEvent\([^,]+,\s*"([A-Za-z0-9_.]+)"/g)) addProducer(m[1], f, lineAt(m.index));
}

// Faux positifs démontrés par l'audit FIX-3 : ce ne sont PAS des événements Outbox.
const NOT_OUTBOX = {
  UNKNOWN: "SignatureProviderEvent.eventType — autre agrégat, jamais écrit dans outbox_events",
  "webhook.test": "crée une WebhookDelivery directement (SendTestWebhookEventUseCase), ne passe pas par l'Outbox",
};
for (const k of Object.keys(NOT_OUTBOX)) producers.delete(k);

// Catalogue webhook gouverné.
const catalogSrc = readFileSync("src/modules/integrations/domain/event-catalog.ts", "utf8");
const governed = [...catalogSrc.matchAll(/^\s+"([a-z_]+\.[a-z_]+)",/gm)].map((m) => m[1]);
// Pont nommage interne PascalCase -> public dot-notation.
const bridge = {};
for (const m of catalogSrc.matchAll(/case "([A-Za-z0-9_.]+)":\s*\n\s*return "([a-z_]+\.[a-z_]+)"/g)) bridge[m[1]] = m[2];

const rows = [...producers.keys()].sort().map((et) => ({
  eventType: et,
  module: moduleOf([...producers.get(et)][0].split(":")[0]),
  producers: [...producers.get(et)],
  internalHandler: handlers.get(et) ?? null,
  webhookPublicType: bridge[et] ?? (governed.includes(et) ? et : null),
}));

const out = {
  generatedAt: new Date().toISOString(),
  totals: {
    produced: rows.length,
    withInternalHandler: rows.filter((r) => r.internalHandler).length,
    withoutInternalHandler: rows.filter((r) => !r.internalHandler).length,
    webhookBridged: rows.filter((r) => r.webhookPublicType).length,
    governedWebhookTypes: governed.length,
  },
  excludedFalsePositives: NOT_OUTBOX,
  handlersWithoutProducer: [...handlers.keys()].filter((h) => !producers.has(h)),
  governedWebhookTypes: governed,
  rows,
};
writeFileSync("artifacts/fix3a-certification/matrix.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.totals, null, 1));
console.log("handlers sans producteur:", out.handlersWithoutProducer);
console.log("\n--- SANS HANDLER INTERNE ---");
for (const r of rows.filter((x) => !x.internalHandler)) console.log("  %s %s", r.module.padEnd(24), r.eventType);
