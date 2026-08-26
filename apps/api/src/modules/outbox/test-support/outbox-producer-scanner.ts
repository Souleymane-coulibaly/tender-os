import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3C : découverte des `eventType` réellement PRODUITS.
 *
 * POURQUOI PAS UN SIMPLE GREP — l'audit FIX-3 a démontré l'angle mort : un balayage littéral rate
 * les producteurs conditionnels et le fait SILENCIEUSEMENT (`DceAnalysisCompleted/Failed`,
 * `AdministrativeFormGenerated/GenerationFailed`, `TaskCompleted/TaskUpdated` — six types invisibles,
 * d'où l'écart 76 → 78). Un contrat bâti sur un tel scanner donnerait une fausse assurance.
 *
 * POURQUOI PAS UN HELPER TYPÉ CHEZ LES PRODUCERS — ce serait la solution la plus sûre, mais elle
 * exige de modifier des dizaines de use cases métier, ce que le périmètre FIX-3C interdit.
 *
 * LA GARANTIE RÉELLE APPORTÉE ICI : le scanner ne se contente pas d'extraire ce qu'il reconnaît, il
 * CLASSE chaque occurrence de `eventType:` dans un fichier producteur. Toute forme syntaxique qu'il
 * ne sait pas interpréter est remontée dans `unrecognized` — donc un producteur écrit demain dans une
 * forme imprévue fait ÉCHOUER le contrat au lieu de passer inaperçu. L'angle mort devient bruyant.
 *
 * Ce module est de l'infrastructure de TEST : il ne participe à aucun chemin runtime.
 */

/** Un fichier n'est considéré producteur que s'il écrit réellement dans l'Outbox — cela exclut
 *  d'emblée les autres usages du mot `eventType` (webhooks Stripe, `SignatureProviderEvent`,
 *  `WebhookDelivery`), qui ne sont pas des événements Outbox. */
const OUTBOX_WRITE_MARKERS = [
  "outboxWriter.write",
  "outboxEvents:",
  "recordOutboxEvent",
  "OutboxWriter",
  // Un use case peut DÉCLARER le type et DÉLÉGUER l'écriture à un service générique
  // (`official-form-generation-runner`) : il ne porte alors aucun marqueur d'écriture. Omettre ce
  // marqueur rendait `AdministrativeFormGenerated`/`GenerationFailed` invisibles — angle mort
  // révélé par la réconciliation avec le catalogue, jamais par le scan seul.
  "outboxEventType",
];

/** Formes de VALEUR reconnues pour un `eventType:`. Une occurrence qui n'entre dans aucune de ces
 *  catégories est signalée, jamais ignorée. */
const LITERAL = /^"([A-Za-z0-9_.]+)"$/;
const TERNARY_LITERALS = /^[^?]*\?\s*"([A-Za-z0-9_.]+)"\s*:\s*"([A-Za-z0-9_.]+)"$/;
/** Déclaration de type (`eventType: string`) ou passe-plat (`event.eventType`) : ne produit aucun
 *  nouveau type, l'ignorer est correct et documenté. */
const TYPE_DECLARATION = /^(string|number|boolean)\b/;
/** Annotation de TYPE union (`"A" | "B" | "C"`) : déclare les valeurs POSSIBLES d'un paramètre,
 *  n'en produit aucune. Les productions réelles sont captées aux sites d'appel. */
const TYPE_UNION = /^"[A-Za-z0-9_.]+"(\s*\|\s*"[A-Za-z0-9_.]+")+$/;
const PASS_THROUGH = /^[A-Za-z_$][\w$]*\.[\w$]+$/;
/** Indirection : les deux branches sont des champs injectés (`input.outboxEventTypeCompleted`).
 *  Les valeurs concrètes sont captées par la règle `outboxEventType*` aux sites d'appel. */
const TERNARY_PASS_THROUGH = /^[^?]*\?\s*[A-Za-z_$][\w$]*\.[\w$]+\s*:\s*[A-Za-z_$][\w$]*\.[\w$]+$/;

export type OutboxProducerScanResult = {
  /** eventType → fichiers:ligne qui le produisent. */
  producedEventTypes: Map<string, string[]>;
  /** Occurrences dont la forme n'a pas pu être interprétée — doivent faire échouer le contrat. */
  unrecognized: { file: string; line: number; expression: string }[];
  scannedProducerFiles: string[];
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts")) acc.push(p.replace(/\\/g, "/"));
  }
  return acc;
}

/** Extrait l'expression qui suit `eventType:` jusqu'à la fin de la valeur, ternaires multi-lignes
 *  compris — un simple `[^,\n]*` couperait une expression sur plusieurs lignes et produirait
 *  exactement le faux négatif que ce scanner doit éliminer. */
function readExpression(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const c = source[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return source.slice(from, i);
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

export function scanProducedOutboxEventTypes(root = "src"): OutboxProducerScanResult {
  const producedEventTypes = new Map<string, string[]>();
  const unrecognized: OutboxProducerScanResult["unrecognized"] = [];
  const scannedProducerFiles: string[] = [];

  const add = (eventType: string, file: string, line: number): void => {
    const sites = producedEventTypes.get(eventType) ?? [];
    sites.push(`${file}:${line}`);
    producedEventTypes.set(eventType, sites);
  };

  for (const file of walk(root)) {
    // Les fichiers de test et l'infrastructure de test déclarent des types SYNTHÉTIQUES, qui n'ont
    // volontairement aucune place dans le catalogue produit (§18).
    if (file.includes(".spec.") || file.includes("/test-support/")) continue;
    const source = readFileSync(file, "utf8");
    if (!OUTBOX_WRITE_MARKERS.some((marker) => source.includes(marker))) continue;
    scannedProducerFiles.push(file);

    // Les handlers déclarent `readonly eventType = "X"` : ils CONSOMMENT, ils ne produisent pas.
    const isHandlerFile = file.includes("/outbox-handlers/");

    for (const match of source.matchAll(/\beventType:\s*/g)) {
      if (isHandlerFile) continue;
      const start = match.index + match[0].length;
      const expression = readExpression(source, start).trim();
      const line = source.slice(0, match.index).split("\n").length;

      const literal = LITERAL.exec(expression);
      if (literal) {
        add(literal[1]!, file, line);
        continue;
      }
      const ternary = TERNARY_LITERALS.exec(expression.replace(/\s+/g, " "));
      if (ternary) {
        add(ternary[1]!, file, line);
        add(ternary[2]!, file, line);
        continue;
      }
      const normalized = expression.replace(/\s+/g, " ");
      if (TYPE_DECLARATION.test(expression) || TYPE_UNION.test(normalized) || PASS_THROUGH.test(expression) || TERNARY_PASS_THROUGH.test(normalized)) continue;
      unrecognized.push({ file, line, expression: expression.slice(0, 120) });
    }

    // Types passés à un runner générique via des champs dédiés (`official-form-generation-runner`).
    for (const match of source.matchAll(/outboxEventType(?:Completed|Failed):\s*"([A-Za-z0-9_.]+)"/g)) {
      add(match[1]!, file, source.slice(0, match.index).split("\n").length);
    }
    // Helper interne du module `analysis`.
    for (const match of source.matchAll(/recordOutboxEvent\([^,]+,\s*(?:[^,]*\?\s*)?"([A-Za-z0-9_.]+)"(?:\s*:\s*"([A-Za-z0-9_.]+)")?/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      add(match[1]!, file, line);
      if (match[2]) add(match[2]!, file, line);
    }
  }

  return { producedEventTypes, unrecognized, scannedProducerFiles };
}

/** Handlers Outbox réellement déclarés dans le code — jamais une liste recopiée, qui divergerait. */
export function scanRegisteredHandlerEventTypes(root = "src"): Map<string, string> {
  const handlers = new Map<string, string>();
  for (const file of walk(root)) {
    if (!file.includes("/outbox-handlers/") || file.includes(".spec.")) continue;
    for (const match of readFileSync(file, "utf8").matchAll(/readonly\s+eventType\s*[:=]\s*"([A-Za-z0-9_.]+)"/g)) {
      handlers.set(match[1]!, file);
    }
  }
  return handlers;
}
