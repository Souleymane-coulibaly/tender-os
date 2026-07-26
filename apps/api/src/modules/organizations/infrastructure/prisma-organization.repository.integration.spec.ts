import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Organization } from "../domain/organization.aggregate";
import { OrganizationId } from "../domain/organization-id.value-object";
import { OrganizationSlug } from "../domain/organization-slug.value-object";
import { PrismaOrganizationRepository } from "./prisma-organization.repository";

describe("PrismaOrganizationRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaOrganizationRepository(prisma);
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrganizationIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    }
    await prisma.$disconnect();
  });

  function createOrganization(slug: string): Organization {
    const id = OrganizationId.from(randomUUID());
    createdOrganizationIds.push(id.value);

    return Organization.create({
      id,
      name: "Acme Corp",
      slug: OrganizationSlug.create(slug),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date(),
    });
  }

  it("persists a new organization and reads it back by id", async () => {
    const organization = createOrganization(`acme-${randomUUID()}`);

    await repository.save(organization);
    const found = await repository.findById(organization.id);

    expect(found).not.toBeNull();
    expect(found?.slug.value).toBe(organization.slug.value);
    expect(found?.status).toBe("TRIAL");
  });

  it("finds an organization by slug", async () => {
    const slug = `acme-${randomUUID()}`;
    const organization = createOrganization(slug);
    await repository.save(organization);

    const found = await repository.findBySlug(OrganizationSlug.create(slug));

    expect(found?.id.value).toBe(organization.id.value);
  });

  it("returns null when no organization matches", async () => {
    const found = await repository.findById(OrganizationId.from(randomUUID()));

    expect(found).toBeNull();
  });

  it("persists updates made to an already-saved organization", async () => {
    const organization = createOrganization(`acme-${randomUUID()}`);
    await repository.save(organization);

    organization.updateProfile({ legalName: "Acme Corporation SAS" }, new Date());
    await repository.save(organization);

    const found = await repository.findById(organization.id);
    expect(found?.legalName).toBe("Acme Corporation SAS");
  });

  it("hides a soft-deleted organization from findById and findBySlug", async () => {
    const slug = `acme-${randomUUID()}`;
    const organization = createOrganization(slug);
    await repository.save(organization);

    organization.markDeleted(new Date());
    await repository.save(organization);

    expect(await repository.findById(organization.id)).toBeNull();
    expect(await repository.findBySlug(OrganizationSlug.create(slug))).toBeNull();
  });
});
