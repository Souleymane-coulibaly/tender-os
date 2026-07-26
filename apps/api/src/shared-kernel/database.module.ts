import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Module global d'accès à la base de données (skills/platform-foundation/SKILL.md §19.1 —
 * la connexion base de données fait partie des capacités réellement transversales).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
