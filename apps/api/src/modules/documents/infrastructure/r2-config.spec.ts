import { describe, expect, it } from "vitest";
import { loadR2Config } from "./r2-config";

const VALID_ENV: NodeJS.ProcessEnv = {
  R2_ACCOUNT_ID: "account-123",
  R2_ACCESS_KEY_ID: "access-key-123",
  R2_SECRET_ACCESS_KEY: "secret-key-123",
  R2_BUCKET_NAME: "tenderos-documents",
  R2_ENDPOINT: "https://account-123.r2.cloudflarestorage.com",
};

describe("loadR2Config", () => {
  it("loads a valid configuration", () => {
    const config = loadR2Config(VALID_ENV);

    expect(config).toEqual({
      accountId: "account-123",
      accessKeyId: "access-key-123",
      secretAccessKey: "secret-key-123",
      bucketName: "tenderos-documents",
      endpoint: "https://account-123.r2.cloudflarestorage.com",
    });
  });

  it.each(Object.keys(VALID_ENV))("throws a clear error naming the variable when %s is missing", (missingKey) => {
    const env = { ...VALID_ENV, [missingKey]: undefined };

    expect(() => loadR2Config(env)).toThrow(new RegExp(missingKey));
  });
});
