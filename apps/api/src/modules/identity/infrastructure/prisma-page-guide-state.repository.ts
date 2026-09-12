import { Injectable } from "@nestjs/common";
import { Prisma, type UserPageGuideState as UserPageGuideStateRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  ApplyPageGuideStateChangesInput,
  PageGuideStateRepository,
} from "../application/ports/page-guide-state.repository";
import { PageGuideState } from "../domain/page-guide-state.entity";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toDomain(record: UserPageGuideStateRecord): PageGuideState {
  return PageGuideState.rehydrate({
    id: record.id,
    userId: record.userId,
    guideKey: record.guideKey,
    completedAt: record.completedAt ?? undefined,
    dismissedAt: record.dismissedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaPageGuideStateRepository implements PageGuideStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<PageGuideState[]> {
    const records = await this.prisma.userPageGuideState.findMany({
      where: { userId },
      orderBy: { guideKey: "asc" },
    });

    return records.map(toDomain);
  }

  /** Une seule écriture sur la clé unique (user_id, guide_key) : `update` ne contient QUE les
   *  colonnes de l'action, l'autre date n'est jamais réécrite (aucune perte en cas d'actions
   *  concurrentes). Si Prisma exécute l'upsert en « lecture puis insertion » plutôt qu'en
   *  `INSERT ... ON CONFLICT`, deux premières actions simultanées peuvent entrer en collision sur
   *  la création : la perdante (P2002) est rejouée une fois — la ligne existe alors, c'est une
   *  simple mise à jour. */
  async apply(input: ApplyPageGuideStateChangesInput): Promise<PageGuideState> {
    try {
      return await this.upsert(input);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      return this.upsert(input);
    }
  }

  private async upsert(input: ApplyPageGuideStateChangesInput): Promise<PageGuideState> {
    const record = await this.prisma.userPageGuideState.upsert({
      where: { userId_guideKey: { userId: input.userId, guideKey: input.guideKey } },
      create: {
        id: input.id,
        userId: input.userId,
        guideKey: input.guideKey,
        ...input.changes,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      },
      update: {
        ...input.changes,
        updatedAt: input.occurredAt,
      },
    });

    return toDomain(record);
  }
}
