import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";

export const FIXED_NOW = new Date("2026-07-26T14:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}

  now(): Date {
    return this.value;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;

    return `id-${this.counter}`;
  }
}
