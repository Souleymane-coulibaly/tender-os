import type { MarketType } from "../../domain/market-type";
import type { TenderCountry } from "../../domain/tender-country";
import type { TenderLanguage } from "../../domain/tender-language";
import type { TenderSource } from "../../domain/tender-source";

/**
 * Port [PRÉPARÉ] (bible/04-architecture/system-architecture.md §50) — abstraction uniquement.
 * Aucune implémentation (BOAMP, TED, marché privé...) n'existe et aucun provider NestJS ne
 * l'enregistre : ce fichier ne fait qu'stabiliser la forme du contrat pour le jour où un premier
 * connecteur réel sera construit. Indépendant de NestJS/Prisma/tout SDK externe — un futur
 * adaptateur vivrait en Infrastructure, jamais ce fichier lui-même.
 *
 * Une source ne doit jamais changer le comportement interne du moteur DCE (mission architecture
 * §7) : un Tender importé via un connecteur doit entrer dans le même pipeline qu'un Tender créé
 * manuellement — ce port ne produit que la matière première (`ExternalTender`), jamais un Tender.
 */
export type TenderSearchCriteria = Readonly<{
  query?: string | undefined;
  country?: TenderCountry | undefined;
  publishedAfter?: string | undefined;
  cursor?: string | undefined;
}>;

export type TenderSourceSearchResult = Readonly<{
  externalReference: string;
  title: string;
  buyerName?: string | undefined;
  country?: TenderCountry | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  sourceUrl?: string | undefined;
}>;

export type ExternalTender = Readonly<{
  externalReference: string;
  title: string;
  buyerName?: string | undefined;
  description?: string | undefined;
  marketType?: MarketType | undefined;
  country?: TenderCountry | undefined;
  language?: TenderLanguage | undefined;
  currency?: string | undefined;
  estimatedAmount?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  sourceUrl?: string | undefined;
}>;

export type ExternalTenderDocument = Readonly<{
  externalReference: string;
  fileName: string;
  mimeType?: string | undefined;
  downloadUrl: string;
}>;

export interface TenderSourceConnector {
  readonly source: TenderSource;
  search(criteria: TenderSearchCriteria): Promise<TenderSourceSearchResult[]>;
  fetchTender(externalReference: string): Promise<ExternalTender>;
  fetchDocuments(externalReference: string): Promise<ExternalTenderDocument[]>;
}
