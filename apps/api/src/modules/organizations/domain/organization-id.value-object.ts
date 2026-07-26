export class OrganizationId {
  private constructor(readonly value: string) {}

  static from(value: string): OrganizationId {
    return new OrganizationId(value);
  }

  equals(other: OrganizationId): boolean {
    return this.value === other.value;
  }
}
