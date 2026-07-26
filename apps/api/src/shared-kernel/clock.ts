/**
 * Abstraction du temps (skills/platform-foundation/DATABASE_PATTERNS.md §63,
 * skills/platform-foundation/TESTING_PATTERNS.md §19) — le Domain et l'Application
 * ne lisent jamais `new Date()` directement, pour rester déterministes en test.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
