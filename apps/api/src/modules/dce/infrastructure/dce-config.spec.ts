import { describe, expect, it } from "vitest";
import { loadDceConfig } from "./dce-config";

const VALID_ENV: NodeJS.ProcessEnv = {
  DCE_MAX_FILE_SIZE_MB: "25",
  DCE_MAX_FILES_PER_IMPORT: "20",
  DCE_ZIP_MAX_ENTRIES: "200",
  DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB: "200",
  DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB: "50",
  DCE_ZIP_MAX_COMPRESSION_RATIO: "100",
};

describe("loadDceConfig", () => {
  it("loads and converts a valid configuration (MB -> bytes)", () => {
    const config = loadDceConfig(VALID_ENV);

    expect(config.maxFileSizeBytes).toBe(25 * 1024 * 1024);
    expect(config.maxFilesPerImport).toBe(20);
    expect(config.zipLimits).toEqual({
      maxEntries: 200,
      maxTotalUncompressedBytes: 200 * 1024 * 1024,
      maxSingleEntryUncompressedBytes: 50 * 1024 * 1024,
      maxCompressionRatio: 100,
    });
  });

  it.each(Object.keys(VALID_ENV))("throws a clear error naming the variable when %s is missing", (missingKey) => {
    const env = { ...VALID_ENV, [missingKey]: undefined };

    expect(() => loadDceConfig(env)).toThrow(new RegExp(missingKey));
  });

  it("throws when a numeric variable is not a number", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_MAX_FILE_SIZE_MB: "not-a-number" })).toThrow(
      /DCE_MAX_FILE_SIZE_MB/,
    );
  });

  it("throws when a numeric variable is negative", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_MAX_FILES_PER_IMPORT: "-5" })).toThrow(
      /DCE_MAX_FILES_PER_IMPORT/,
    );
  });

  it("throws when a numeric variable is zero", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_ZIP_MAX_ENTRIES: "0" })).toThrow(/DCE_ZIP_MAX_ENTRIES/);
  });

  it("throws when a count-like variable is not an integer", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_MAX_FILES_PER_IMPORT: "1.5" })).toThrow(
      /DCE_MAX_FILES_PER_IMPORT/,
    );
  });

  it("throws when the compression ratio is not greater than 1", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_ZIP_MAX_COMPRESSION_RATIO: "1" })).toThrow(
      /DCE_ZIP_MAX_COMPRESSION_RATIO/,
    );
  });

  it("allows a non-integer compression ratio (e.g. 100.5)", () => {
    expect(() => loadDceConfig({ ...VALID_ENV, DCE_ZIP_MAX_COMPRESSION_RATIO: "100.5" })).not.toThrow();
  });

  it("throws when the total uncompressed limit is smaller than the single-entry limit (incoherent thresholds)", () => {
    expect(() =>
      loadDceConfig({
        ...VALID_ENV,
        DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB: "10",
        DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB: "50",
      }),
    ).toThrow(/DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB/);
  });

  it("allows the total uncompressed limit to equal the single-entry limit", () => {
    expect(() =>
      loadDceConfig({
        ...VALID_ENV,
        DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB: "50",
        DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB: "50",
      }),
    ).not.toThrow();
  });
});
