export class TenderId {
  private constructor(readonly value: string) {}

  static from(value: string): TenderId {
    return new TenderId(value);
  }

  equals(other: TenderId): boolean {
    return this.value === other.value;
  }
}
