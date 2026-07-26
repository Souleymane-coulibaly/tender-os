import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MembershipPage, MembershipRepository } from "../application/ports/membership.repository";
import type { OrganizationMembership } from "../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../domain/organization-role";
import { MembershipStatus } from "../domain/membership-status";
import {
  OrganizationMembershipPersistenceMapper,
  type MembershipRecordWithRole,
} from "./organization-membership.persistence-mapper";

const MEMBERSHIP_INCLUDE = { roles: { include: { role: true } } } as const;

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
  private readonly mapper = new OrganizationMembershipPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
      include: MEMBERSHIP_INCLUDE,
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      include: MEMBERSHIP_INCLUDE,
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async listByOrganization(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage> {
    const records = await this.prisma.organizationMembership.findMany({
      where: { organizationId: input.organizationId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    return this.toPage(records, input.limit);
  }

  async listByUser(input: { userId: string; cursor?: string | undefined; limit: number }): Promise<MembershipPage> {
    const records = await this.prisma.organizationMembership.findMany({
      where: { userId: input.userId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    return this.toPage(records, input.limit);
  }

  async countActiveByOrganizationAndRole(input: { organizationId: string; role: OrganizationRole }): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: {
        organizationId: input.organizationId,
        status: MembershipStatus.Active,
        roles: { some: { role: { code: input.role } } },
      },
    });
  }

  async countActiveByOrganization(organizationId: string): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: { organizationId, status: MembershipStatus.Active },
    });
  }

  async save(membership: OrganizationMembership): Promise<void> {
    const data = this.mapper.toPersistence(membership);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: membership.role } });

    await this.prisma.$transaction([
      this.prisma.organizationMembership.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      }),
      this.prisma.membershipRole.deleteMany({ where: { membershipId: data.id } }),
      this.prisma.membershipRole.create({
        data: { membershipId: data.id, roleId: role.id },
      }),
    ]);
  }

  private toPage(records: MembershipRecordWithRole[], limit: number): MembershipPage {
    const hasNextPage = records.length > limit;
    const page = hasNextPage ? records.slice(0, limit) : records;
    const items = page.map((record) => this.mapper.toDomain(record));

    return {
      items,
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
