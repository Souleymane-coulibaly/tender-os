export class DceId {
  private constructor(readonly value: string) {}

  static from(value: string): DceId {
    return new DceId(value);
  }

  equals(other: DceId): boolean {
    return this.value === other.value;
  }
}
