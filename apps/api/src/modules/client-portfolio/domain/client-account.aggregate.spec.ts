import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientAccount } from "./client-account.aggregate";
import { ClientAccountStatus } from "./client-account-status";
import { ClientAccountArchivedError } from "./errors";

const ORG = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-31T10:00:00Z");

function createClient(overrides: Partial<Parameters<typeof ClientAccount.create>[0]> = {}) {
  return ClientAccount.create({
    id: randomUUID(),
    organizationId: ORG,
    name: "Acme Corp",
    createdBy: ACTOR,
    occurredAt: NOW,
    ...overrides,
  });
}

describe("ClientAccount", () => {
  it("is created ACTIVE by default, with a normalized name", () => {
    const client = createClient({ name: "  Acme   Corp  " });
    expect(client.status).toBe(ClientAccountStatus.Active);
    expect(client.name).toBe("  Acme   Corp  ");
    expect(client.nameNormalized).toBe("acme corp");
  });

  it("accepts an explicit initial status (ACTIVE or INACTIVE), never ARCHIVED at creation", () => {
    const inactive = createClient({ status: ClientAccountStatus.Inactive });
    expect(inactive.status).toBe(ClientAccountStatus.Inactive);
  });

  it("updates details without touching the status", () => {
    const client = createClient();
    client.updateDetails({ sector: "Construction", website: "https://acme.example" }, ACTOR, NOW);
    expect(client.sector).toBe("Construction");
    expect(client.website).toBe("https://acme.example");
    expect(client.status).toBe(ClientAccountStatus.Active);
  });

  it("re-normalizes the name when it is updated", () => {
    const client = createClient();
    client.updateDetails({ name: "  ACME Corp International  " }, ACTOR, NOW);
    expect(client.nameNormalized).toBe("acme corp international");
  });

  it("archives an ACTIVE client, setting archivedAt", () => {
    const client = createClient();
    client.archive(NOW);
    expect(client.status).toBe(ClientAccountStatus.Archived);
    expect(client.archivedAt).toEqual(NOW);
  });

  it("archiving an already-archived client is idempotent (no-op, never throws)", () => {
    const client = createClient();
    client.archive(NOW);
    expect(() => client.archive(new Date(NOW.getTime() + 1000))).not.toThrow();
    expect(client.archivedAt).toEqual(NOW); // jamais réécrit par un second archivage
  });

  it("restores an archived client back to ACTIVE, clearing archivedAt", () => {
    const client = createClient();
    client.archive(NOW);
    client.restore(new Date(NOW.getTime() + 1000));
    expect(client.status).toBe(ClientAccountStatus.Active);
    expect(client.archivedAt).toBeUndefined();
  });

  it("restoring an already-active client is idempotent (no-op, never throws)", () => {
    const client = createClient();
    expect(() => client.restore(NOW)).not.toThrow();
    expect(client.status).toBe(ClientAccountStatus.Active);
  });

  it("rejects mutating an archived client's details", () => {
    const client = createClient();
    client.archive(NOW);
    expect(() => client.updateDetails({ sector: "x" }, ACTOR, NOW)).toThrow(ClientAccountArchivedError);
  });

  it("toggles between ACTIVE and INACTIVE without archiving", () => {
    const client = createClient();
    client.setActiveOrInactive(ClientAccountStatus.Inactive, ACTOR, NOW);
    expect(client.status).toBe(ClientAccountStatus.Inactive);
    client.setActiveOrInactive(ClientAccountStatus.Active, ACTOR, NOW);
    expect(client.status).toBe(ClientAccountStatus.Active);
  });

  it("never allows an archived client to be selected for a new tender", () => {
    const client = createClient();
    client.archive(NOW);
    expect(() => client.assertSelectableForNewTender()).toThrow(ClientAccountArchivedError);
  });

  it("a non-archived client is always selectable for a new tender", () => {
    const client = createClient();
    expect(() => client.assertSelectableForNewTender()).not.toThrow();
  });

  it("refuses permanent deletion unless the client is archived first", () => {
    const client = createClient();
    expect(() => client.assertDeletable()).toThrow();
    client.archive(NOW);
    expect(() => client.assertDeletable()).not.toThrow();
  });

  it("rejects an invalid status transition (e.g. directly instantiating an inconsistent jump)", () => {
    const client = createClient();
    client.archive(NOW);
    // Un client archivé ne peut transiter que vers ACTIVE (restore) — jamais directement vers
    // INACTIVE (aurait besoin de repasser par restore() explicitement).
    expect(() => client.setActiveOrInactive(ClientAccountStatus.Inactive, ACTOR, NOW)).toThrow(ClientAccountArchivedError);
  });
});
