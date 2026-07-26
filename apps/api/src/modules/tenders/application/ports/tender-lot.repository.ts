import type { TenderLot } from "../../domain/tender-lot.entity";

export interface TenderLotRepository {
  findById(input: { organizationId: string; tenderId: string; lotId: string }): Promise<TenderLot | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderLot[]>;
  save(lot: TenderLot): Promise<void>;
  delete(input: { organizationId: string; tenderId: string; lotId: string }): Promise<void>;
}

export const TENDER_LOT_REPOSITORY = Symbol("TENDER_LOT_REPOSITORY");
