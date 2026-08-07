export class OpportunityId {
  private constructor(readonly value: string) {}

  static from(value: string): OpportunityId {
    return new OpportunityId(value);
  }

  equals(other: OpportunityId): boolean {
    return this.value === other.value;
  }
}
