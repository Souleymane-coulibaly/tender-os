import { PrismaClient } from "@prisma/client";
import { OrganizationPermission, ROLE_PERMISSIONS } from "../src/modules/memberships/domain/organization-permission";
import { ORGANIZATION_ROLE_NAMES, OrganizationRole } from "../src/modules/memberships/domain/organization-role";

function splitPermissionCode(code: string): { resource: string; action: string } {
  const [resource, ...actionParts] = code.split(":");
  return { resource: resource ?? code, action: actionParts.join(":") };
}

/**
 * Seed idempotent des rôles et permissions système (docs/04-architecture/DATABASE_DESIGN.md §31 —
 * "rôles système ; permissions système" sont explicitement des exemples de seed autorisés).
 * Source unique de vérité : les constantes du Domain Memberships — cette fonction ne fait que les
 * projeter en lignes SQL, elle n'invente aucun rôle ni permission supplémentaire.
 *
 * Exportée (plutôt que confinée à `main()` ci-dessous) pour être rejouée par tout autre script
 * qui en dépend — notamment `seed-staging.ts`, qui crée des `OrganizationMembership` référençant
 * ces `Role` par leur `code` : sans ces lignes, cette écriture échoue avec
 * `No record was found for a query. modelName: 'Role'`. Accepte un client déjà connecté plutôt
 * que d'en ouvrir un nouveau, pour permettre à l'appelant de réutiliser sa propre connexion/transaction.
 */
export async function seedSystemRolesAndPermissions(prisma: PrismaClient): Promise<void> {
  for (const code of Object.values(OrganizationPermission)) {
    const { resource, action } = splitPermissionCode(code);
    await prisma.permission.upsert({
      where: { code },
      create: { code, resource, action },
      update: { resource, action },
    });
  }

  for (const code of Object.values(OrganizationRole)) {
    await prisma.role.upsert({
      where: { code },
      create: { code, name: ORGANIZATION_ROLE_NAMES[code], scope: "ORGANIZATION", isSystem: true },
      update: { name: ORGANIZATION_ROLE_NAMES[code] },
    });
  }

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { code: role } });

    for (const permissionCode of permissions) {
      const permissionRecord = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleRecord.id, permissionId: permissionRecord.id } },
        create: { roleId: roleRecord.id, permissionId: permissionRecord.id },
        update: {},
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedSystemRolesAndPermissions(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// N'exécute `main()` que lorsque ce fichier est lancé directement (`prisma db seed` / `tsx
// prisma/seed.ts`) — jamais lorsqu'il est importé comme module par un autre script (ex.
// seed-staging.ts), qui pilote lui-même sa propre connexion Prisma et son propre cycle de vie.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
