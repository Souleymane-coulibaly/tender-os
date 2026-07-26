import { randomUUID } from "node:crypto";
import { EmailAddress } from "../src/modules/identity/domain/email-address.value-object";
import { User } from "../src/modules/identity/domain/user.aggregate";
import { UserId } from "../src/modules/identity/domain/user-id.value-object";
import { PrismaUserRepository } from "../src/modules/identity/infrastructure/prisma-user.repository";
import { ScryptPasswordHasher } from "../src/modules/identity/infrastructure/scrypt-password-hasher";
import { PlatformAdministratorId } from "../src/modules/platform-administration/domain/platform-administrator-id.value-object";
import { PlatformAdministrator } from "../src/modules/platform-administration/domain/platform-administrator.aggregate";
import { PlatformRole } from "../src/modules/platform-administration/domain/platform-role";
import { PrismaPlatformAdministratorRepository } from "../src/modules/platform-administration/infrastructure/prisma-platform-administrator.repository";
import { PrismaService } from "../src/shared-kernel/prisma.service";

/**
 * Bootstrap du premier PLATFORM_OWNER — script explicite, sans mot de passe codé en dur
 * (mission Platform Administration). Lit PLATFORM_OWNER_EMAIL/PLATFORM_OWNER_PASSWORD depuis
 * l'environnement (jamais un défaut). Idempotent par utilisateur : réutilise le compte s'il
 * existe déjà, ne duplique jamais un enregistrement PlatformAdministrator.
 *
 * Usage : PLATFORM_OWNER_EMAIL=... PLATFORM_OWNER_PASSWORD=... DATABASE_URL=... \
 *   pnpm --filter @tenderos/api bootstrap:platform-owner
 */
async function main(): Promise<void> {
  const email = process.env.PLATFORM_OWNER_EMAIL;
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  const displayName = process.env.PLATFORM_OWNER_DISPLAY_NAME ?? "Platform Owner";

  if (!email || !password) {
    console.error("PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD environment variables are required.");
    process.exitCode = 1;
    return;
  }

  if (password.length < 12) {
    console.error("PLATFORM_OWNER_PASSWORD must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const userRepository = new PrismaUserRepository(prisma);
    const administratorRepository = new PrismaPlatformAdministratorRepository(prisma);
    const passwordHasher = new ScryptPasswordHasher();

    const emailAddress = EmailAddress.create(email);
    let user = await userRepository.findByEmail(emailAddress);

    if (!user) {
      const passwordHash = await passwordHasher.hash(password);
      user = User.register({
        id: UserId.from(randomUUID()),
        email: emailAddress,
        displayName,
        passwordHash,
        occurredAt: new Date(),
      });
      await userRepository.save(user);
      console.log(`Created user ${email}.`);
    } else {
      console.log(`User ${email} already exists, reusing it.`);
    }

    const existingAdministrator = await administratorRepository.findByUserId(user.id.value);

    if (existingAdministrator) {
      console.log(`User ${email} is already a platform administrator (${existingAdministrator.role}). Nothing to do.`);
      return;
    }

    const administrator = PlatformAdministrator.create({
      id: PlatformAdministratorId.from(randomUUID()),
      userId: user.id.value,
      role: PlatformRole.Owner,
      occurredAt: new Date(),
    });
    await administratorRepository.save(administrator);

    console.log(`Granted PLATFORM_OWNER to ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
