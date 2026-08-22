import { Injectable, Logger } from "@nestjs/common";
import { MarketType } from "../../../tenders/domain/market-type";
import { TenderSource } from "../../../tenders/domain/tender-source";
import type { CollectedTender, MarketSourceConnector, MarketSourceSearchCriteria, MarketSourceSearchResult } from "../../application/ports/market-source-connector";

const TED_API_URL = "https://api.ted.europa.eu/v3/notices/search";
const REQUEST_TIMEOUT_MS = 15_000;
/** Mission §7/§47 (TEST S2 "TED nominal") — champs eForms réellement demandés, vérifiés
 *  empiriquement contre l'API publique (aucune clé requise) le 2026-08-22 : la disponibilité de
 *  chaque champ varie selon le type d'avis (ex. `deadline` absent sur un avis de pré-information),
 *  jamais garantie — d'où l'extraction best-effort ci-dessous, même discipline que BOAMP. */
const TED_FIELDS = [
  "publication-number",
  "notice-title",
  "publication-date",
  "deadline",
  "classification-cpv",
  "buyer-name",
  "buyer-country",
  "buyer-city",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "links",
] as const;
/** Langues préférées pour les champs multilingues (`notice-title`, `links.pdf`) — clés 3 lettres
 *  minuscules pour les objets de titre, majuscules pour `links.pdf` (forme réelle observée). */
const PREFERRED_LANGUAGES = ["fra", "eng"] as const;
const PREFERRED_LANGUAGES_UPPER = ["FRA", "ENG"] as const;

type TedMultilingualText = Readonly<Record<string, string>>;

type TedNotice = Readonly<{
  "publication-number"?: string;
  "notice-title"?: TedMultilingualText;
  "publication-date"?: string;
  deadline?: string;
  "classification-cpv"?: readonly string[];
  "buyer-name"?: Readonly<Record<string, readonly string[]>>;
  "buyer-country"?: string | readonly string[];
  "buyer-city"?: string | readonly string[];
  "estimated-value-lot"?: readonly string[];
  "estimated-value-cur-lot"?: readonly string[];
  links?: Readonly<{ pdf?: Readonly<Record<string, string>> }>;
}>;

type TedSearchResponse = Readonly<{ notices?: readonly TedNotice[]; totalNoticeCount?: number }>;

function firstPreferredValue(record: Readonly<Record<string, string>> | undefined, preferredKeys: readonly string[]): string | undefined {
  if (!record) return undefined;
  for (const key of preferredKeys) {
    const value = record[key];
    if (value) return value;
  }
  const firstKey = Object.keys(record)[0];
  return firstKey ? record[firstKey] : undefined;
}

function multilingualArrayFirst(record: Readonly<Record<string, readonly string[]>> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of PREFERRED_LANGUAGES) {
    const values = record[key];
    if (values && values.length > 0) return values[0];
  }
  const firstKey = Object.keys(record)[0];
  const values = firstKey ? record[firstKey] : undefined;
  return values?.[0];
}

function firstScalarOrArrayValue(value: string | readonly string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : (value as string);
}

/** `estimated-value-lot` est un tableau (un montant par lot, mission §37 "conserver les lots si la
 *  source les expose") — best-effort : premier montant numérique valide, jamais une somme ou un
 *  choix arbitraire qui prétendrait représenter le marché entier. */
function firstNumericValue(values: readonly string[] | undefined): number | undefined {
  if (!values) return undefined;
  for (const raw of values) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** La forme réelle observée empiriquement (`"2026-08-15+01:00"`, sans `T`) n'est PAS un ISO 8601
 *  valide pour `new Date()` (retourne systématiquement Invalid Date) — un `T00:00:00` est inséré
 *  avant le décalage horaire final quand aucun `T` n'est déjà présent. */
function parseDateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const normalized = value.includes("T") ? value : value.replace(/([+-]\d{2}:\d{2})$/, "T00:00:00$1");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** `YYYYMMDD`, forme exacte acceptée par la syntaxe de requête TED (vérifié empiriquement). */
function toTedDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Connecteur RÉEL (Checkpoint TENDEROS-2.1-P2.3-E3) — API de recherche publique TED
 * (api.ted.europa.eu/v3/notices/search), sans clé d'authentification, vérifiée accessible en
 * développement (mission §7 "identifier le statut réel de TED", jusque-là un simple nom d'enum
 * sans implémentation). Même discipline que `BoampSourceConnector` (mission §0 "ne pas dupliquer
 * BOAMP/TED", ici il s'agit d'AJOUTER ce qui manquait réellement, jamais de reconstruire BOAMP) :
 * `search()` ne traduit PAS les critères SavedSearch en filtre fin — seule une fenêtre de
 * fraîcheur (`publishedAfter` ou une valeur par défaut bornée) et un tri récence sont envoyés au
 * serveur, tout le filtrage réel reste au matching applicatif (mission §26).
 */
@Injectable()
export class TedSourceConnector implements MarketSourceConnector {
  private readonly logger = new Logger(TedSourceConnector.name);

  readonly source = TenderSource.Ted;
  readonly marketType = MarketType.Public;

  async search(criteria: MarketSourceSearchCriteria): Promise<MarketSourceSearchResult> {
    const page = criteria.cursor ? Number(criteria.cursor) : 1;
    const safePage = Number.isFinite(page) && page >= 1 ? page : 1;

    // Mission §43 — la fraîcheur horaire de TenderOS ne garantit jamais la fraîcheur de la source
    // elle-même : une fenêtre par défaut de 30 jours (jamais l'intégralité de l'historique TED, des
    // centaines de milliers d'avis) quand l'appelant ne fournit aucun `publishedAfter`.
    const defaultFloor = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const floor = criteria.publishedAfter ?? defaultFloor;
    const query = `publication-date>=${toTedDate(floor)} SORT BY publication-date DESC`;

    let response: Response;
    try {
      response = await fetch(TED_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, fields: TED_FIELDS, limit: criteria.limit, scope: "ACTIVE", page: safePage }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TED source unreachable: ${message}`);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`TED API responded HTTP ${response.status}`);
    }

    const body = (await response.json()) as TedSearchResponse;
    const items: CollectedTender[] = (body.notices ?? [])
      .map((notice): CollectedTender | undefined => {
        const externalId = notice["publication-number"];
        const title = firstPreferredValue(notice["notice-title"], PREFERRED_LANGUAGES);
        if (!externalId || !title) return undefined;

        const cpvCodes = [...new Set(notice["classification-cpv"] ?? [])];
        const sourceUrl = firstPreferredValue(notice.links?.pdf, PREFERRED_LANGUAGES_UPPER);

        return {
          externalId,
          title,
          buyerName: multilingualArrayFirst(notice["buyer-name"]),
          country: firstScalarOrArrayValue(notice["buyer-country"]),
          city: firstScalarOrArrayValue(notice["buyer-city"]),
          cpvCodes,
          estimatedAmount: firstNumericValue(notice["estimated-value-lot"]),
          currency: notice["estimated-value-cur-lot"]?.[0],
          publicationDate: parseDateOrUndefined(notice["publication-date"]),
          submissionDeadline: parseDateOrUndefined(notice.deadline),
          sourceUrl,
          // Mission §9 (même discipline que BOAMP) — jamais le payload complet.
          rawMetadata: { tedPublicationNumber: externalId },
        };
      })
      .filter((item): item is CollectedTender => item !== undefined);

    const nextCursor = items.length === criteria.limit ? String(safePage + 1) : null;

    return { items, nextCursor };
  }
}
