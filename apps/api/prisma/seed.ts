import { PrismaClient } from "@prisma/client";
import { OrganizationPermission, ROLE_PERMISSIONS } from "../src/modules/memberships/domain/organization-permission";
import { ORGANIZATION_ROLE_NAMES, OrganizationRole } from "../src/modules/memberships/domain/organization-role";

/**
 * Seed idempotent des rôles et permissions système (docs/04-architecture/DATABASE_DESIGN.md §31 —
 * "rôles système ; permissions système" sont explicitement des exemples de seed autorisés).
 * Source unique de vérité : les constantes du Domain Memberships — ce script ne fait que les
 * projeter en lignes SQL, il n'invente aucun rôle ni permission supplémentaire.
 */
const prisma = new PrismaClient();

function splitPermissionCode(code: string): { resource: string; action: string } {
  const [resource, ...actionParts] = code.split(":");
  return { resource: resource ?? code, action: actionParts.join(":") };
}

async function main(): Promise<void> {
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
