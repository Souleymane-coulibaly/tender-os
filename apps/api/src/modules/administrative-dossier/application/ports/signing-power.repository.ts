import type { SigningPower } from "../../domain/signing-power.aggregate";

export interface SigningPowerRepository {
  create(power: SigningPower): Promise<void>;
  findById(input: { organizationId: string; signingPowerId: string }): Promise<SigningPower | null>;
  listByTenderId(input: { organizationId: string; tenderId: string }): Promise<readonly SigningPower[]>;
  save(power: SigningPower): Promise<void>;
}

export const SIGNING_POWER_REPOSITORY = Symbol("SIGNING_POWER_REPOSITORY");
