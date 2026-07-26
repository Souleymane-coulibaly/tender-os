export class MembershipId {
  private constructor(readonly value: string) {}

  static from(value: string): MembershipId {
    return new MembershipId(value);
  }

  equals(other: MembershipId): boolean {
    return this.value === other.value;
  }
}
