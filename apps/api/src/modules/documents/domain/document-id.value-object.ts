export class DocumentId {
  private constructor(readonly value: string) {}

  static from(value: string): DocumentId {
    return new DocumentId(value);
  }

  equals(other: DocumentId): boolean {
    return this.value === other.value;
  }
}
