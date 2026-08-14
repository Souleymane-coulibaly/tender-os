import { Injectable } from "@nestjs/common";
import { CountActiveMembersUseCase } from "../../../memberships";
import { CountTodayChatUsageForOrganizationUseCase } from "../../../chat";
import { GetOrganizationStorageUsageUseCase } from "../../../documents";

export type OrganizationUsageSnapshot = Readonly<{
  activeUsers: number;
  chatMessagesToday: number;
  storageBytesUsed: number;
}>;

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * V2 Sprint 22 (billing, étape 22D) — composition read-model pure pour l'écran "Abonnement &
 * utilisation" (client) et Platform Admin (mission §44/§45/§43 : Chat IA/jour, stockage,
 * utilisateurs). Vit délibérément HORS du module `billing` : Billing ne peut pas importer Chat
 * directement (Chat -> Tenders -> Billing formerait un cycle de modules), donc ce module — jamais
 * importé en retour par aucun des trois — assume seul la composition, même motif architectural que
 * `dashboard` (Sprint 15, "jamais un accès Prisma cross-module direct" : chaque nombre vient d'un
 * use case déjà exporté par son module propriétaire).
 */
@Injectable()
export class GetOrganizationUsageUseCase {
  constructor(
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    private readonly countTodayChatUsageForOrganizationUseCase: CountTodayChatUsageForOrganizationUseCase,
    private readonly getOrganizationStorageUsageUseCase: GetOrganizationStorageUsageUseCase,
  ) {}

  async execute(input: { organizationId: string; now: Date }): Promise<OrganizationUsageSnapshot> {
    const since = startOfTodayUtc(input.now);
    const [activeUsers, chatMessagesToday, storageBytesUsed] = await Promise.all([
      this.countActiveMembersUseCase.execute({ organizationId: input.organizationId }),
      this.countTodayChatUsageForOrganizationUseCase.execute({ organizationId: input.organizationId, since }),
      this.getOrganizationStorageUsageUseCase.execute(input.organizationId),
    ]);
    return { activeUsers, chatMessagesToday, storageBytesUsed };
  }
}
