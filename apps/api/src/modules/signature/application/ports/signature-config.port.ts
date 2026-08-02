import type { SignatureProviderName } from "../../domain/signature-level";

export type SignatureConfig = Readonly<{
  provider: SignatureProviderName;
}>;

export const SIGNATURE_CONFIG = Symbol("SIGNATURE_CONFIG");
