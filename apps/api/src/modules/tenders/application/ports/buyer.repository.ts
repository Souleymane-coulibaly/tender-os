import type { Buyer } from "../../domain/buyer.entity";

export interface BuyerRepository {
  findById(input: { organizationId: string; buyerId: string }): Promise<Buyer | null>;
  list(input: { organizationId: string; search?: string | undefined; includeArchived?: boolean | undefined }): Promise<Buyer[]>;
  save(buyer: Buyer): Promise<void>;
}

export const BUYER_REPOSITORY = Symbol("BUYER_REPOSITORY");
