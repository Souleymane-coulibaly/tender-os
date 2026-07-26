import type { PlatformAdministratorRepository } from "../application/ports/platform-administrator.repository";
import type { PlatformAdministrator } from "../domain/platform-administrator.aggregate";

export class InMemoryPlatformAdministratorRepository implements PlatformAdministratorRepository {
  private readonly records = new Map<string, PlatformAdministrator>();

  async findByUserId(userId: string): Promise<PlatformAdministrator | null> {
    for (const administrator of this.records.values()) {
      if (administrator.userId === userId) {
        return administrator;
      }
    }
    return null;
  }

  async countByRole(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const administrator of this.records.values()) {
      counts[administrator.role] = (counts[administrator.role] ?? 0) + 1;
    }
    return counts;
  }

  async save(administrator: PlatformAdministrator): Promise<void> {
    this.records.set(administrator.id.value, administrator);
  }

  async seed(administrator: PlatformAdministrator): Promise<void> {
    await this.save(administrator);
  }
}
