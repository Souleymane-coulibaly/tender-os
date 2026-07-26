import type { PlatformAdministrator as PlatformAdministratorRecord } from "@prisma/client";
import { PlatformAdministrator } from "../domain/platform-administrator.aggregate";
import { PlatformAdministratorId } from "../domain/platform-administrator-id.value-object";
import type { PlatformRole } from "../domain/platform-role";

export type PlatformAdministratorPersistenceData = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

export class PlatformAdministratorPersistenceMapper {
  toDomain(record: PlatformAdministratorRecord): PlatformAdministrator {
    return PlatformAdministrator.rehydrate({
      id: PlatformAdministratorId.from(record.id),
      userId: record.userId,
      role: record.role as PlatformRole,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  toPersistence(administrator: PlatformAdministrator): PlatformAdministratorPersistenceData {
    return {
      id: administrator.id.value,
      userId: administrator.userId,
      role: administrator.role,
      createdAt: administrator.createdAt,
      updatedAt: administrator.updatedAt,
    };
  }
}
