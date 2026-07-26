import { Injectable } from "@nestjs/common";
import type { User as UserRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { UserPage, UserRepository } from "../application/ports/user.repository";
import type { EmailAddress } from "../domain/email-address.value-object";
import type { User } from "../domain/user.aggregate";
import type { UserId } from "../domain/user-id.value-object";
import { UserStatus } from "../domain/user-status";
import { UserPersistenceMapper } from "./user.persistence-mapper";

@Injectable()
export class PrismaUserRepository implements UserRepository {
  private readonly mapper = new UserPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: email.value },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async findById(id: UserId): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id: id.value },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async list(input: {
    cursor?: string | undefined;
    limit: number;
    status?: UserStatus | undefined;
  }): Promise<UserPage> {
    const records = await this.prisma.user.findMany({
      where: { deletedAt: null, ...(input.status ? { status: input.status } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record: UserRecord) => this.mapper.toDomain(record)),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async countByStatus(): Promise<Record<UserStatus, number>> {
    const rows = await this.prisma.user.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const counts: Record<UserStatus, number> = {
      [UserStatus.Invited]: 0,
      [UserStatus.Active]: 0,
      [UserStatus.Suspended]: 0,
      [UserStatus.Deactivated]: 0,
    };

    for (const row of rows) {
      counts[row.status as UserStatus] = row._count._all;
    }

    return counts;
  }

  async save(user: User): Promise<void> {
    const data = this.mapper.toPersistence(user);

    await this.prisma.user.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
