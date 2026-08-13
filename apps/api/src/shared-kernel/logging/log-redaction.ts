/**
 * Sprint 21 (hardening) — mission §19 (rédaction des secrets dans les logs) : mécanisme central
 * de rédaction, réutilisable partout où une valeur potentiellement sensible pourrait finir dans un
 * log (en-têtes HTTP, corps de requête sérialisé pour du debug, erreurs contenant un message
 * fournisseur). Une clé/valeur est jamais rédigée "au cas où" — seulement les clés/motifs connus
 * pour porter un secret réel (Authorization, cookies de session, clés API, tokens OAuth, secrets de
 * webhook), jamais une sur-rédaction qui rendrait les logs inutilisables.
 */
const REDACTED_PLACEHOLDER = "[REDACTED]";

/** Insensible à la casse — les en-têtes HTTP arrivent dans des casses variées selon le client. */
const SENSITIVE_KEY_PATTERN = /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret|password|secret)$/i;

/** Motifs de VALEURS reconnaissables comme des secrets même sous une clé au nom anodin (ex. un
 *  message d'erreur fournisseur qui a fuité un token dans son texte). Bornés à des préfixes connus
 *  et concrets — jamais une regex générique "toute chaîne longue" qui redigerait des UUID/ID métier
 *  légitimes. */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /\bsk_[a-zA-Z0-9_-]{10,}\b/g, // clés API de style Stripe/OpenAI (ex. sk_live_51H8...) — l'underscore fait partie de la clé
  /\bwhsec_[a-zA-Z0-9_-]{10,}\b/g, // secrets de webhook Stripe-style
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

function redactValue(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED_PLACEHOLDER);
  }
  return result;
}

/** Rédige récursivement un objet/tableau — jamais une profondeur illimitée (protection contre une
 *  structure cyclique ou pathologiquement profonde issue d'une erreur tierce mal formée). */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return input;

  if (typeof input === "string") {
    return redactValue(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => redact(item, depth + 1));
  }

  if (input && typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED_PLACEHOLDER;
      } else {
        result[key] = redact(value, depth + 1);
      }
    }
    return result;
  }

  return input;
}
