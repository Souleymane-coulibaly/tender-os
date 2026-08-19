import { describe, expect, it } from "vitest";
import { CandidateMigrationClassification, classifyClientAccountForCandidateMigration } from "./candidate-migration-classification";

const VALID_SIREN = "356000000";
const INVALID_SIREN = "356000001";
const VALID_SIRET = "35600000000048";
const INVALID_SIRET = "35600000000049";

describe("classifyClientAccountForCandidateMigration", () => {
  it("returns ALREADY_MIGRATED when the caller has already found a CandidateCompany for this source (idempotence)", () => {
    const result = classifyClientAccountForCandidateMigration({ alreadyMigrated: true, legalIdentity: null, satelliteRecordCount: 0 });
    expect(result.classification).toBe(CandidateMigrationClassification.AlreadyMigrated);
    expect(result.useSiren).toBeNull();
    expect(result.useSiretPrincipal).toBeNull();
  });

  it("returns NOT_A_CANDIDATE for a plain commercial client: no legal identity, no satellite records", () => {
    const result = classifyClientAccountForCandidateMigration({ alreadyMigrated: false, legalIdentity: null, satelliteRecordCount: 0 });
    expect(result.classification).toBe(CandidateMigrationClassification.NotACandidate);
  });

  it("returns REQUIRES_REVIEW when satellite records exist but no active legal identity anchors them", () => {
    const result = classifyClientAccountForCandidateMigration({ alreadyMigrated: false, legalIdentity: null, satelliteRecordCount: 3 });
    expect(result.classification).toBe(CandidateMigrationClassification.RequiresReview);
  });

  it("returns REQUIRES_REVIEW when the legal identity is ARCHIVED, even with a valid SIREN (never trust a non-ACTIVE record)", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ARCHIVED", siren: VALID_SIREN, siretPrincipal: VALID_SIRET },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.RequiresReview);
  });

  it("returns AUTO_MIGRATABLE when the active legal identity has an independently Luhn-valid SIREN, and also carries a valid SIRET for establishment creation", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: VALID_SIREN, siretPrincipal: VALID_SIRET },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.AutoMigratable);
    expect(result.useSiren).toBe(VALID_SIREN);
    expect(result.useSiretPrincipal).toBe(VALID_SIRET);
  });

  it("returns AUTO_MIGRATABLE with useSiretPrincipal null when the SIREN is valid but the SIRET fails Luhn (never migrate a bad SIRET)", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: VALID_SIREN, siretPrincipal: INVALID_SIRET },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.AutoMigratable);
    expect(result.useSiren).toBe(VALID_SIREN);
    expect(result.useSiretPrincipal).toBeNull();
  });

  it("returns MIGRATABLE_WITH_RULE when SIREN is missing/invalid but the SIRET is independently Luhn-valid — never derives a SIREN from the SIRET", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: null, siretPrincipal: VALID_SIRET },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.MigratableWithRule);
    expect(result.useSiren).toBeNull();
    expect(result.useSiretPrincipal).toBe(VALID_SIRET);
  });

  it("returns MIGRATABLE_WITH_RULE when the stored SIREN fails Luhn but the SIRET is valid", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: INVALID_SIREN, siretPrincipal: VALID_SIRET },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.MigratableWithRule);
    expect(result.useSiren).toBeNull();
  });

  it("returns REQUIRES_REVIEW when the active legal identity has neither a valid SIREN nor a valid SIRET (e.g. only a legal name filled)", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: null, siretPrincipal: null },
      satelliteRecordCount: 0,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.RequiresReview);
  });

  it("never migrates automatically: REQUIRES_REVIEW always carries useSiren/useSiretPrincipal null", () => {
    const result = classifyClientAccountForCandidateMigration({
      alreadyMigrated: false,
      legalIdentity: { status: "ACTIVE", siren: INVALID_SIREN, siretPrincipal: INVALID_SIRET },
      satelliteRecordCount: 5,
    });
    expect(result.classification).toBe(CandidateMigrationClassification.RequiresReview);
    expect(result.useSiren).toBeNull();
    expect(result.useSiretPrincipal).toBeNull();
  });
});
