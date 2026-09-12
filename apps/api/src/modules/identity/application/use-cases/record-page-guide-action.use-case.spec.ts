import { beforeEach, describe, expect, it } from "vitest";
import { InvalidPageGuideKeyError } from "../../domain/errors";
import { PageGuideAction } from "../../domain/page-guide-state.entity";
import { FixedClock, SequentialIdGenerator } from "../../test-support/fakes";
import { InMemoryPageGuideStateRepository } from "../../test-support/in-memory-page-guide-state.repository";
import { RecordPageGuideActionUseCase } from "./record-page-guide-action.use-case";

const T1 = new Date("2026-07-25T14:00:00.000Z");
const T2 = new Date("2026-07-25T15:30:00.000Z");

/** Horloge réglable : chaque étape d'un scénario se produit à un instant distinct et connu. */
class SettableClock extends FixedClock {
  private current: Date = T1;

  set(value: Date): void {
    this.current = value;
  }

  override now(): Date {
    return this.current;
  }
}

describe("RecordPageGuideActionUseCase", () => {
  let repository: InMemoryPageGuideStateRepository;
  let clock: SettableClock;
  let useCase: RecordPageGuideActionUseCase;

  beforeEach(() => {
    repository = new InMemoryPageGuideStateRepository();
    clock = new SettableClock();
    useCase = new RecordPageGuideActionUseCase(repository, clock, new SequentialIdGenerator());
  });

  it("COMPLETE creates the state with completedAt only (dismissedAt omitted, never null)", async () => {
    const result = await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });

    expect(result).toEqual({ guideKey: "tenders", completedAt: T1.toISOString() });
    expect(result).not.toHaveProperty("dismissedAt");
  });

  it("DISMISS then COMPLETE keeps both dates", async () => {
    await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Dismiss });
    clock.set(T2);

    const result = await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });

    expect(result).toEqual({ guideKey: "tenders", dismissedAt: T1.toISOString(), completedAt: T2.toISOString() });
  });

  it("COMPLETE then DISMISS keeps the earlier completedAt untouched", async () => {
    await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });
    clock.set(T2);

    const result = await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Dismiss });

    expect(result).toEqual({ guideKey: "tenders", completedAt: T1.toISOString(), dismissedAt: T2.toISOString() });
  });

  it("is idempotent: repeating an action keeps a single row and only refreshes its own date", async () => {
    await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });
    await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });
    clock.set(T2);
    const result = await useCase.execute({ userId: "user-1", guideKey: "tenders", action: PageGuideAction.Complete });

    expect(result).toEqual({ guideKey: "tenders", completedAt: T2.toISOString() });
    const stored = await repository.listByUser("user-1");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("id-1");
  });

  it("accepts any well-formed key (no closed list server-side)", async () => {
    const result = await useCase.execute({ userId: "user-1", guideKey: "some-future-screen-42", action: PageGuideAction.Dismiss });

    expect(result).toEqual({ guideKey: "some-future-screen-42", dismissedAt: T1.toISOString() });
  });

  it("rejects a malformed key even when called directly (defense in depth)", async () => {
    await expect(
      useCase.execute({ userId: "user-1", guideKey: "Not_Valid", action: PageGuideAction.Complete }),
    ).rejects.toBeInstanceOf(InvalidPageGuideKeyError);
    expect(await repository.listByUser("user-1")).toEqual([]);
  });
});
