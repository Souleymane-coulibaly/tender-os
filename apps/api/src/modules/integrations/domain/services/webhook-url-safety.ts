import { UnsafeWebhookEndpointUrlError } from "../errors";

/** IPv4 privées/réservées (RFC 1918, RFC 6598, loopback, link-local incl. service de métadonnées
 *  cloud 169.254.169.254, "this network"). Mission §31 — SSRF critique. */
function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT (RFC 6598)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast (224+) / reserved (240+)

  return false;
}

/** IPv6 privées/réservées : loopback (::1), link-local (fe80::/10), unique-local (fc00::/7),
 *  IPv4-mapped (::ffff:a.b.c.d — revérifié récursivement contre les plages IPv4 ci-dessus). */
function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique-local

  const ipv4MappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (ipv4MappedMatch?.[1]) {
    return isPrivateOrReservedIpv4(ipv4MappedMatch[1]);
  }

  return false;
}

const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Vrai si `host` (hostname OU adresse IP littérale) doit être refusé comme cible de webhook —
 *  fonction pure, réutilisée à la fois à la création (hostname littéral) ET après résolution DNS
 *  au moment de la livraison (mission §29/§95, défense DNS-rebinding). */
export function isDisallowedWebhookHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "metadata.google.internal") {
    return true;
  }
  if (IPV4_PATTERN.test(normalized)) {
    return isPrivateOrReservedIpv4(normalized);
  }
  if (normalized.includes(":")) {
    return isPrivateOrReservedIpv6(normalized);
  }
  return false;
}

export type WebhookUrlSafetyOptions = Readonly<{
  requireHttps: boolean;
  /** Échappatoire EXPLICITE réservée aux tests/dev (jamais activée en production — voir l'appelant,
   *  toujours dérivée de `process.env`, jamais un défaut silencieux). Sans elle, un test ne peut
   *  physiquement pas exercer une vraie livraison HTTP (le serveur de test tourne forcément en
   *  local). Mission §95 : documenté comme un compromis de test, jamais une faiblesse de la policy
   *  de production elle-même. */
  allowPrivateNetworks?: boolean | undefined;
}>;

/** Mission §31/§32 — validation au moment de la CRÉATION (hostname littéral + protocole),
 *  jamais suffisante seule contre le DNS rebinding : voir `isDisallowedWebhookHost`, revérifiée
 *  après résolution DNS par le worker de livraison (infrastructure/deliver-webhook.ts). */
export function assertSafeWebhookEndpointUrl(rawUrl: string, options: WebhookUrlSafetyOptions): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookEndpointUrlError("malformed URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeWebhookEndpointUrlError(`protocol "${url.protocol}" is not allowed, only http/https`);
  }
  if (options.requireHttps && url.protocol !== "https:") {
    throw new UnsafeWebhookEndpointUrlError("HTTPS is required in this environment");
  }
  if (!options.allowPrivateNetworks && isDisallowedWebhookHost(url.hostname)) {
    throw new UnsafeWebhookEndpointUrlError(`host "${url.hostname}" targets a private/internal/reserved network`);
  }
}
