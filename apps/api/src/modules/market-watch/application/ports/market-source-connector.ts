import type { ExternalTenderLot } from "../../domain/external-tender.entity";

/**
 * Mission §5 — "MarketSourceAdapter" générique : plusieurs sources possibles, jamais 20
 * connecteurs codés en dur. Relocalisé et étendu depuis le port [PRÉPARÉ] historique
 * `tenders/application/ports/tender-source-connector.ts` (0 consommateur, supprimé — voir
 * rapport Sprint 17 §"architecture sources"). Indépendant de NestJS/Prisma : un adaptateur réel
 * (BOAMP, CUSTOM...) vit en Infrastructure, jamais ce fichier lui-même.
 */
export type MarketSourceSearchCriteria = Readonly<{
  /** Filtre optionnel côté connecteur — un connecteur SANS capacité de filtrage serveur peut
   *  l'ignorer et laisser le matching applicatif faire tout le travail. */
  query?: string | undefined;
  publishedAfter?: Date | undefined;
  cursor?: string | undefined;
  limit: number;
}>;

/** Résultat brut d'un connecteur — jamais persisté tel quel : `NormalizeCollectedTenderService`
 *  (application) le transforme en `ExternalTender` (entité, mission §8). */
export type CollectedTender = Readonly<{
  externalId: string;
  title: string;
  description?: string | undefined;
  buyerName?: string | undefined;
  buyerType?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  department?: string | undefined;
  city?: string | undefined;
  cpvCodes: readonly string[];
  estimatedAmount?: number | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  sourceUrl?: string | undefined;
  lots?: readonly ExternalTenderLot[] | undefined;
  /** Mission §9 — jamais le payload complet, uniquement des champs bruts utiles au
   *  debug/reprocessing (borné, voir chaque connecteur pour ce qu'il retient précisément). */
  rawMetadata?: Record<string, unknown> | undefined;
}>;

export type MarketSourceSearchResult = Readonly<{ items: readonly CollectedTender[]; nextCursor: string | null }>;

export interface MarketSourceConnector {
  /** MANUAL | BOAMP | TED | PRIVATE | OTHER (`TenderSource`, tenders/domain). */
  readonly source: string;
  /** PUBLIC | PRIVATE (`MarketType`, tenders/domain). */
  readonly marketType: string;
  search(criteria: MarketSourceSearchCriteria): Promise<MarketSourceSearchResult>;
}

export const MARKET_SOURCE_CONNECTORS = Symbol("MARKET_SOURCE_CONNECTORS");
