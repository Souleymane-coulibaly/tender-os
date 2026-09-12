import { beforeEach, describe, expect, it } from "vitest";
import { PageGuideAction } from "../../domain/page-guide-state.entity";
import { FIXED_NOW, FixedClock, SequentialIdGenerator } from "../../test-support/fakes";
import { InMemoryPageGuideStateRepository } from "../../test-support/in-memory-page-guide-state.repository";
import { ListPageGuideStatesUseCase } from "./list-page-guide-states.use-case";
import { RecordPageGuideActionUseCase } from "./record-page-guide-action.use-case";

describe("ListPageGuideStatesUseCase", () => {
  let repository: InMemoryPageGuideStateRepository;
  let record: RecordPageGuideActionUseCase;
  let useCase: ListPageGuideStatesUseCase;

  beforeEach(() => {
    repository = new InMemoryPageGuideStateRepository();
    record = new RecordPageGuideActionUseCase(repository, new FixedClock(), new SequentialIdGenerator());
    useCase = new ListPageGuideStatesUseCase(repository);
  });

  it("returns an empty list for a user who has never interacted with a guide", async () => {
    expect(await useCase.execute({ userId: "user-1" })).toEqual([]);
  });

  it("returns only the actor's rows, never another user's", async () => {
    await record.execute({ userId: "user-a", guideKey: "tenders", action: PageGuideAction.Complete });
    await record.execute({ userId: "user-a", guideKey: "dashboard", action: PageGuideAction.Dismiss });
    await record.execute({ userId: "user-b", guideKey: "documents", action: PageGuideAction.Complete });

    const forA = await useCase.execute({ userId: "user-a" });
    const forB = await useCase.execute({ userId: "user-b" });

    expect(forA.map((item) => item.guideKey)).toEqual(["dashboard", "tenders"]);
    expect(forB).toEqual([{ guideKey: "documents", completedAt: FIXED_NOW.toISOString() }]);
  });

  it("omits absent dates (never null)", async () => {
    await record.execute({ userId: "user-1", guideKey: "dashboard", action: PageGuideAction.Dismiss });

    const [item] = await useCase.execute({ userId: "user-1" });

    expect(item).toEqual({ guideKey: "dashboard", dismissedAt: FIXED_NOW.toISOString() });
    expect(Object.keys(item ?? {})).toEqual(["guideKey", "dismissedAt"]);
  });
});
