import type { User as UserRecord } from "@prisma/client";
import { EmailAddress } from "../domain/email-address.value-object";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id.value-object";
import type { UserStatus } from "../domain/user-status";

export type UserPersistenceData = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  termsAcceptedAt: Date | null;
  termsAcceptedVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Traduit entre le modèle Prisma (Infrastructure) et l'agrégat Domain — Prisma ne
 * traverse jamais cette frontière (skills/platform-foundation/ARCHITECTURE_RULES.md §17.2).
 */
export class UserPersistenceMapper {
  toDomain(record: UserRecord): User {
    return User.rehydrate({
      id: UserId.from(record.id),
      email: EmailAddress.create(record.email),
      displayName: record.displayName,
      firstName: record.firstName ?? undefined,
      lastName: record.lastName ?? undefined,
      status: record.status as UserStatus,
      passwordHash: record.passwordHash,
      emailVerifiedAt: record.emailVerifiedAt ?? undefined,
      lastLoginAt: record.lastLoginAt ?? undefined,
      termsAcceptedAt: record.termsAcceptedAt ?? undefined,
      termsAcceptedVersion: record.termsAcceptedVersion ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  toPersistence(user: User): UserPersistenceData {
    return {
      id: user.id.value,
      email: user.email.value,
      displayName: user.displayName,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      status: user.status,
      passwordHash: user.passwordHash,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      termsAcceptedVersion: user.termsAcceptedVersion ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
