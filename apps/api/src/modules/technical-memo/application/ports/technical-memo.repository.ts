import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";

export interface TechnicalMemoRepository {
  create(memo: TechnicalMemo): Promise<void>;
  save(memo: TechnicalMemo): Promise<void>;
  findById(input: { organizationId: string; technicalMemoId: string }): Promise<TechnicalMemo | null>;
  /** Détection de doublon (mission — un mémoire par Tender/lot) : `lotId: null` cible le mémoire
   *  "tous lots"/global, une valeur cible un lot précis — jamais confondus (index partiel unique). */
  findByScope(input: { organizationId: string; tenderId: string; lotId: string | null }): Promise<TechnicalMemo | null>;
  list(input: { organizationId: string; tenderId: string }): Promise<readonly TechnicalMemo[]>;
}

export const TECHNICAL_MEMO_REPOSITORY = Symbol("TECHNICAL_MEMO_REPOSITORY");
