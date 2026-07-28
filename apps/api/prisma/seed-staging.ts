import { randomUUID } from "node:crypto";
import { EmailAddress } from "../src/modules/identity/domain/email-address.value-object";
import { User } from "../src/modules/identity/domain/user.aggregate";
import { UserId } from "../src/modules/identity/domain/user-id.value-object";
import { PrismaUserRepository } from "../src/modules/identity/infrastructure/prisma-user.repository";
import { ScryptPasswordHasher } from "../src/modules/identity/infrastructure/scrypt-password-hasher";
import { Organization } from "../src/modules/organizations/domain/organization.aggregate";
import { OrganizationId } from "../src/modules/organizations/domain/organization-id.value-object";
import { OrganizationSlug } from "../src/modules/organizations/domain/organization-slug.value-object";
import { PrismaOrganizationRepository } from "../src/modules/organizations/infrastructure/prisma-organization.repository";
import { OrganizationMembership } from "../src/modules/memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../src/modules/memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../src/modules/memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../src/modules/memberships/infrastructure/prisma-membership.repository";
import { PrismaService } from "../src/shared-kernel/prisma.service";
import { seedSystemRolesAndPermissions } from "./seed";

/**
 * Seed de comptes de démonstration — STAGING UNIQUEMENT. Jamais exécuté automatiquement
 * (script séparé de `prisma/seed.ts`, jamais appelé par `prisma db seed`/`prisma migrate reset`).
 * Refuse explicitement de s'exécuter si NODE_ENV=production, qui doit rester une garantie
 * indépendante de la discipline opérationnelle ("ne pas lancer cette commande en prod").
 *
 * Idempotent : réutilise Organization/User/Membership déjà existants (mêmes slugs/emails)
 * plutôt que de les dupliquer ou d'échouer — peut être relancé sans risque à chaque déploiement
 * de staging.
 *
 * Autonome sur un environnement vierge : rejoue d'abord `seedSystemRolesAndPermissions` (mêmes
 * upserts que `prisma/seed.ts`, aucune duplication de logique) avant de créer la moindre
 * Membership. Sans cette étape, `PrismaMembershipRepository.save()` échoue avec
 * `No record was found for a query. modelName: 'Role'` — la Membership référence un `Role` par
 * son `code`, qui n'existe que si le seed système a déjà tourné.
 *
 * Mots de passe volontairement en clair dans ce fichier : ce sont des identifiants de
 * démonstration jetables, jamais valides en production, jamais des secrets réels.
 */
type SeedUser = { email: string; password: string; displayName: string; role: OrganizationRole };
type SeedOrganization = { slug: string; name: string; users: SeedUser[] };

const SEED_ORGANIZATIONS: SeedOrganization[] = [
  {
    slug: "tenderos-demo",
    name: "TenderOS Demo",
    users: [
      { email: "admin@tenderos.local", password: "Admin123!", displayName: "Admin Demo", role: OrganizationRole.OrganizationAdmin },
      { email: "user@tenderos.local", password: "User123!", displayName: "User Demo", role: OrganizationRole.Contributor },
      { email: "viewer@tenderos.local", password: "Viewer123!", displayName: "Viewer Demo", role: OrganizationRole.ReadOnly },
    ],
  },
  {
    slug: "acme-demo",
    name: "Acme Demo",
    users: [
      { email: "admin@acme.local", password: "Admin123!", displayName: "Admin Acme", role: OrganizationRole.OrganizationAdmin },
      { email: "user@acme.local", password: "User123!", displayName: "User Acme", role: OrganizationRole.Contributor },
      { email: "viewer@acme.local", password: "Viewer123!", displayName: "Viewer Acme", role: OrganizationRole.ReadOnly },
    ],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run seed-staging.ts: NODE_ENV=production. This script is staging-only.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    // Prérequis des Membership créées plus bas (Role référencé par code) — idempotent, sûr à
    // rejouer à chaque exécution, y compris sur un environnement déjà initialisé.
    await seedSystemRolesAndPermissions(prisma);
    console.log("System roles and permissions ready.");

    const organizationRepository = new PrismaOrganizationRepository(prisma);
    const userRepository = new PrismaUserRepository(prisma);
    const membershipRepository = new PrismaMembershipRepository(prisma);
    const passwordHasher = new ScryptPasswordHasher();
    const now = new Date();

    for (const seedOrg of SEED_ORGANIZATIONS) {
      const slug = OrganizationSlug.create(seedOrg.slug);
      let organization = await organizationRepository.findBySlug(slug);

      if (!organization) {
        organization = Organization.create({
          id: OrganizationId.from(randomUUID()),
          name: seedOrg.name,
          slug,
          defaultCurrency: "EUR",
          defaultTimezone: "Europe/Paris",
          occurredAt: now,
        });
        await organizationRepository.save(organization);
        console.log(`Created organization "${seedOrg.name}" (${seedOrg.slug}).`);
      } else {
        console.log(`Organization "${seedOrg.name}" (${seedOrg.slug}) already exists, reusing it.`);
      }

      for (const seedUser of seedOrg.users) {
        const emailAddress = EmailAddress.create(seedUser.email);
        let user = await userRepository.findByEmail(emailAddress);

        if (!user) {
          const passwordHash = await passwordHasher.hash(seedUser.password);
          user = User.register({
            id: UserId.from(randomUUID()),
            email: emailAddress,
            displayName: seedUser.displayName,
            passwordHash,
            occurredAt: now,
          });
          await userRepository.save(user);
          console.log(`  Created user ${seedUser.email}.`);
        } else {
          console.log(`  User ${seedUser.email} already exists, reusing it.`);
        }

        const existingMembership = await membershipRepository.findByOrganizationAndUser({
          organizationId: organization.id.value,
          userId: user.id.value,
        });

        if (existingMembership) {
          console.log(`  Membership ${seedUser.email} -> ${seedOrg.slug} already exists (${existingMembership.role}).`);
          continue;
        }

        await membershipRepository.save(
          OrganizationMembership.create({
            id: MembershipId.from(randomUUID()),
            organizationId: organization.id.value,
            userId: user.id.value,
            role: seedUser.role,
            occurredAt: now,
          }),
        );
        console.log(`  Granted ${seedUser.role} to ${seedUser.email} on ${seedOrg.slug}.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
