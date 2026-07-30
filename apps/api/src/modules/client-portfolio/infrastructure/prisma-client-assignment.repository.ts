import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ClientAssignmentRepository } from "../application/ports/client-assignment.repository";
import { DuplicateClientAssignmentError } from "../domain/errors";
import type { ClientAssignment } from "../domain/client-assignment.entity";
import { toDomain, toPersistence } from "./client-assignment.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaClientAssignmentRepository implements ClientAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; assignmentId: string }): Promise<ClientAssignment | null> {
    const record = await this.prisma.clientAssignment.findFirst({ where: { id: input.assignmentId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findByClientAndUser(input: { organizationId: string; clientAccountId: string; userId: string }): Promise<ClientAssignment | null> {
    const record = await this.prisma.clientAssignment.findFirst({
      where: { organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId },
    });
    return record ? toDomain(record) : null;
  }

  async create(assignment: ClientAssignment): Promise<void> {
    try {
      await this.prisma.clientAssignment.create({ data: toPersistence(assignment) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateClientAssignmentError();
      }
      throw error;
    }
  }

  async save(assignment: ClientAssignment): Promise<void> {
    const data = toPersistence(assignment);
    await this.prisma.clientAssignment.update({ where: { id: data.id }, data });
  }

  async delete(input: { organizationId: string; assignmentId: string }): Promise<void> {
    await this.prisma.clientAssignment.delete({ where: { id: input.assignmentId, organizationId: input.organizationId } });
  }

  async listByClient(input: { organizationId: string; clientAccountId: string }): Promise<readonly ClientAssignment[]> {
    const records = await this.prisma.clientAssignment.findMany({
      where: { organizationId: input.organizationId, clientAccountId: input.clientAccountId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return records.map(toDomain);
  }

  async listClientAccountIdsByUser(input: { organizationId: string; userId: string }): Promise<readonly string[]> {
    const records = await this.prisma.clientAssignment.findMany({
      where: { organizationId: input.organizationId, userId: input.userId },
      select: { clientAccountId: true },
    });
    return records.map((record) => record.clientAccountId);
  }
}
