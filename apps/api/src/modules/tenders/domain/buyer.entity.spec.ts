import { describe, expect, it } from "vitest";
import { Buyer } from "./buyer.entity";

function createBuyer(): Buyer {
  return Buyer.create({
    id: "buyer-1",
    organizationId: "org-1",
    name: "Mairie de Test",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("Buyer.create", () => {
  it("requires only a name, every other field stays undefined (mission §5 — données parfois incomplètes)", () => {
    const buyer = createBuyer();

    expect(buyer.name).toBe("Mairie de Test");
    expect(buyer.siret).toBeUndefined();
    expect(buyer.archivedAt).toBeUndefined();
  });
});

describe("Buyer#update", () => {
  it("applies only the provided fields and bumps updatedAt/updatedBy", () => {
    const buyer = createBuyer();

    buyer.update({ siret: "12345678901234", city: "Paris" }, "user-2", new Date("2026-02-01T00:00:00Z"));

    expect(buyer.siret).toBe("12345678901234");
    expect(buyer.city).toBe("Paris");
    expect(buyer.name).toBe("Mairie de Test");
    expect(buyer.updatedBy).toBe("user-2");
    expect(buyer.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });
});

describe("Buyer#archive / #restore", () => {
  it("sets and clears archivedAt", () => {
    const buyer = createBuyer();

    buyer.archive("user-2", new Date("2026-03-01T00:00:00Z"));
    expect(buyer.archivedAt).toEqual(new Date("2026-03-01T00:00:00Z"));

    buyer.restore("user-2", new Date("2026-03-02T00:00:00Z"));
    expect(buyer.archivedAt).toBeUndefined();
  });
});
