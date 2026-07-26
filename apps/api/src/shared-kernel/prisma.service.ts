import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Point d'accès unique à Prisma (skills/platform-foundation/DATABASE_PATTERNS.md §71).
 * Aucun autre composant n'instancie PrismaClient directement.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        "Impossible de se connecter à la base de données au démarrage ; le serveur démarre quand même (liveness indépendante de la readiness DB). Les requêtes dépendant de la base échoueront tant que la connexion n'est pas rétablie.",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma disconnected");
  }
}
