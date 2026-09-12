import type {
  ApplyPageGuideStateChangesInput,
  PageGuideStateRepository,
} from "../application/ports/page-guide-state.repository";
import { PageGuideState } from "../domain/page-guide-state.entity";

/** Reproduit la sémantique de l'upsert Prisma sur (userId, guideKey) : création avec `id` fourni,
 *  sinon seules les colonnes de `changes` sont réécrites. */
export class InMemoryPageGuideStateRepository implements PageGuideStateRepository {
  private readonly records = new Map<string, PageGuideState>();

  async listByUser(userId: string): Promise<PageGuideState[]> {
    return [...this.records.values()]
      .filter((state) => state.userId === userId)
      .sort((a, b) => a.guideKey.localeCompare(b.guideKey));
  }

  async apply(input: ApplyPageGuideStateChangesInput): Promise<PageGuideState> {
    const key = `${input.userId}:${input.guideKey}`;
    const existing = this.records.get(key);

    const next = PageGuideState.rehydrate({
      id: existing?.id ?? input.id,
      userId: input.userId,
      guideKey: input.guideKey,
      completedAt: existing?.completedAt,
      dismissedAt: existing?.dismissedAt,
      createdAt: existing?.createdAt ?? input.occurredAt,
      ...input.changes,
      updatedAt: input.occurredAt,
    });
    this.records.set(key, next);

    return next;
  }
}
