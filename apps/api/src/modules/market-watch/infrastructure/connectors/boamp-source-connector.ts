import { Injectable, Logger } from "@nestjs/common";
import { MarketType } from "../../../tenders/domain/market-type";
import { TenderSource } from "../../../tenders/domain/tender-source";
import type { CollectedTender, MarketSourceConnector, MarketSourceSearchCriteria, MarketSourceSearchResult } from "../../application/ports/market-source-connector";
import { resolveFrenchRegionFromDepartment } from "../../domain/services/french-geography";
import { MarketSourceHttpError } from "../../application/services/with-source-retry";

const BOAMP_API_BASE_URL = "https://boamp-datadila.opendatasoft.com/api/records/1.0/search/";
const REQUEST_TIMEOUT_MS = 15_000;

/** Forme réelle d'un enregistrement BOAMP (opendatasoft), vérifiée empiriquement (Sprint 17) —
 *  champs plats fiables au niveau `fields`, `donnees` = JSON hérité du XML legacy (variable selon
 *  `nature`), jamais parsé en profondeur au-delà de `OBJET.CPV`/`LOTS.LOT` (mission §3 "adapter à
 *  la réalité des données disponibles"). */
type BoampRecordFields = Readonly<{
  id?: string;
  idweb?: string;
  objet?: string;
  nomacheteur?: string;
  dateparution?: string;
  datelimitereponse?: string;
  code_departement?: string;
  type_marche?: string;
  procedure_libelle?: string;
  url_avis?: string;
  donnees?: string;
}>;

type BoampSearchResponse = Readonly<{ records: ReadonlyArray<{ fields: BoampRecordFields }> }>;

function firstDepartmentCode(codeDepartement: string | undefined): string | undefined {
  return codeDepartement?.split(",")[0]?.trim() || undefined;
}

function parseDateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Extraction best-effort du CPV/des lots depuis le JSON hérité `donnees` — jamais une exception
 *  propagée (un enregistrement BOAMP à la forme inattendue est simplement moins enrichi, jamais
 *  perdu). */
function extractFromLegacyDonnees(donneesRaw: string | undefined): { cpvCodes: string[]; description?: string | undefined; lots?: CollectedTender["lots"] | undefined } {
  if (!donneesRaw) return { cpvCodes: [] };
  try {
    const donnees = JSON.parse(donneesRaw) as Record<string, unknown>;
    const objet = donnees["OBJET"] as Record<string, unknown> | undefined;
    const cpvCodes: string[] = [];
    const principalCpv = (objet?.["CPV"] as Record<string, unknown> | undefined)?.["PRINCIPAL"];
    if (typeof principalCpv === "string" && principalCpv.trim().length > 0) {
      cpvCodes.push(principalCpv.trim());
    }

    const lotsContainer = (donnees["LOTS"] as Record<string, unknown> | undefined)?.["LOT"];
    const lotEntries = Array.isArray(lotsContainer) ? lotsContainer : lotsContainer ? [lotsContainer] : [];
    const lots = lotEntries
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return undefined;
        const lot = entry as Record<string, unknown>;
        const num = lot["NUM"];
        if (typeof num !== "string") return undefined;
        const lotCpv = (lot["CPV"] as Record<string, unknown> | undefined)?.["PRINCIPAL"];
        return { number: num, description: typeof lot["DESCRIPTION"] === "string" ? (lot["DESCRIPTION"] as string) : undefined, cpvCode: typeof lotCpv === "string" ? lotCpv : undefined };
      })
      .filter((lot): lot is NonNullable<typeof lot> => lot !== undefined);

    const description = typeof objet?.["OBJET_COMPLET"] === "string" ? (objet["OBJET_COMPLET"] as string) : undefined;

    return { cpvCodes, description, lots: lots.length > 0 ? lots : undefined };
  } catch {
    return { cpvCodes: [] };
  }
}

/**
 * Connecteur RÉEL (décision Sprint 17, validée) — flux open-data public DILA/BOAMP, sans clé
 * d'authentification (vérifié accessible en développement). `search()` ne traduit PAS les
 * critères SavedSearch en requête serveur : il récupère un lot récent trié par date de parution,
 * le matching applicatif (mission §26) fait tout le travail de filtrage ensuite — un connecteur
 * SANS capacité de filtrage fin reste utilisable (mission §5 "adapter à la réalité").
 */
/**
 * Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-004) — BOAMP livre certains champs texte avec des
 * ENTITES HTML deja encodees (`Ville d&#039;Arcueil`), qui s'affichaient telles quelles dans le
 * produit. La normalisation a lieu ICI, a l'INGESTION : la donnee persistee redevient du texte
 * brut, ce qui evite un double decodage cote lecture et n'exige aucun rendu HTML dangereux dans
 * l'interface (React echappe deja tout texte par defaut, la sortie reste donc sure).
 *
 * Jeu volontairement FERME d'entites : seules les cinq entites XML/HTML de base et les references
 * numeriques sont decodees. On ne deroule jamais un decodage recursif — `&amp;#039;` doit rester
 * `&#039;` apres un seul passage, jamais devenir une apostrophe (protection contre le double
 * decodage, qui permettrait de reconstituer des sequences non voulues).
 */
const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function decodedOrUndefined(value: string | undefined): string | undefined {
  return value === undefined ? undefined : decodeHtmlEntities(value);
}

@Injectable()
export class BoampSourceConnector implements MarketSourceConnector {
  private readonly logger = new Logger(BoampSourceConnector.name);

  readonly source = TenderSource.Boamp;
  readonly marketType = MarketType.Public;

  async search(criteria: MarketSourceSearchCriteria): Promise<MarketSourceSearchResult> {
    const start = criteria.cursor ? Number(criteria.cursor) : 0;
    const params = new URLSearchParams({
      dataset: "boamp",
      rows: String(criteria.limit),
      start: String(Number.isFinite(start) ? start : 0),
      // Diagnostic runtime E10 (correctif P0, prouvé contre l'API réelle) — l'API Opendatasoft v1
      // de BOAMP INVERSE la convention habituelle : `sort=-dateparution` renvoie les avis les plus
      // ANCIENS (2015-03-02), `sort=dateparution` les plus RÉCENTS (date du jour). Vérifié
      // empiriquement sur les deux directions. Le préfixe `-` faisait donc ingérer en boucle les
      // 100 mêmes avis de 2015 : `collected=100 created=0 unchanged=100 matches=0` à chaque cycle,
      // et un backfill (fenêtre 30 jours) systématiquement vide — aucune veille ne pouvait jamais
      // matcher quoi que ce soit, quels que soient ses critères.
      sort: "dateparution",
    });
    if (criteria.query) {
      params.set("q", criteria.query);
    }
    if (criteria.publishedAfter) {
      const isoDate = criteria.publishedAfter.toISOString().slice(0, 10);
      params.set("q", `${params.get("q") ? `${params.get("q")} AND ` : ""}dateparution:[${isoDate} TO *]`);
    }

    let response: Response;
    try {
      response = await fetch(`${BOAMP_API_BASE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`BOAMP source unreachable: ${message}`);
      throw error;
    }

    if (!response.ok) {
      throw new MarketSourceHttpError("BOAMP", response.status);
    }

    const body = (await response.json()) as BoampSearchResponse;
    const items: CollectedTender[] = body.records
      .map((record): CollectedTender | undefined => {
        const f = record.fields;
        const externalId = f.idweb ?? f.id;
        if (!externalId || !f.objet) return undefined;

        const { cpvCodes, description, lots } = extractFromLegacyDonnees(f.donnees);
        const department = firstDepartmentCode(f.code_departement);

        return {
          externalId,
          title: decodeHtmlEntities(f.objet),
          description: decodedOrUndefined(description),
          buyerName: decodedOrUndefined(f.nomacheteur),
          country: "FR",
          region: resolveFrenchRegionFromDepartment(department),
          department,
          cpvCodes,
          procedureType: f.procedure_libelle ?? f.type_marche,
          publicationDate: parseDateOrUndefined(f.dateparution),
          submissionDeadline: parseDateOrUndefined(f.datelimitereponse),
          sourceUrl: f.url_avis,
          lots,
          // Mission §9 — champs bruts utiles au debug/provenance, jamais le JSON `donnees` complet.
          rawMetadata: { boampId: f.id, boampIdWeb: f.idweb, typeMarche: f.type_marche },
        };
      })
      .filter((item): item is CollectedTender => item !== undefined);

    const nextStart = start + criteria.limit;
    const nextCursor = items.length === criteria.limit ? String(nextStart) : null;

    return { items, nextCursor };
  }
}
