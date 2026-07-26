export class PlatformAdministratorId {
  private constructor(readonly value: string) {}

  static from(value: string): PlatformAdministratorId {
    return new PlatformAdministratorId(value);
  }

  equals(other: PlatformAdministratorId): boolean {
    return this.value === other.value;
  }
}
