import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { firstValueFrom, of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsState } from "./quests.state";
import { LoadTraders, ToggleQuestCompleted, RunScrape } from "./quests.actions";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto, QuestDto, ScrapeSummaryDto } from "../../../core/api/quests.api";

describe("QuestsState", () => {
  let store: Store;
  let questsApi: { getTraders: Mock; updateQuestCompleted: Mock; runScrape: Mock };

  const trader: TraderDto = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, quests: [] };
  const quest: QuestDto = {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: [],
    rewards: [],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    });
    store = TestBed.inject(Store);
  });

  it("LoadTraders populates traders and clears loading", async () => {
    questsApi.getTraders.mockReturnValue(of([{ ...trader, quests: [quest] }]));

    await firstValueFrom(store.dispatch(new LoadTraders()));

    const traders = store.selectSnapshot(QuestsState.traders);
    expect(traders).toHaveLength(1);
    expect(traders[0].quests[0].name).toBe("Debut");
    expect(store.selectSnapshot(QuestsState.loading)).toBe(false);
  });

  it("ToggleQuestCompleted updates the quest's completed flag in state", async () => {
    questsApi.getTraders.mockReturnValue(of([{ ...trader, quests: [quest] }]));
    questsApi.updateQuestCompleted.mockReturnValue(of({ ...quest, completed: true }));

    await firstValueFrom(store.dispatch(new LoadTraders()));
    await firstValueFrom(store.dispatch(new ToggleQuestCompleted(1, true)));

    const traders = store.selectSnapshot(QuestsState.traders);
    expect(traders[0].quests[0].completed).toBe(true);
    expect(questsApi.updateQuestCompleted).toHaveBeenCalledWith(1, true);
  });

  it("RunScrape stores the scrape summary and reloads traders", async () => {
    const summary: ScrapeSummaryDto = { added: 1, updated: 0, deactivated: 0, totalQuests: 1 };
    questsApi.runScrape.mockReturnValue(of(summary));
    questsApi.getTraders.mockReturnValue(of([trader]));

    await firstValueFrom(store.dispatch(new RunScrape()));

    expect(store.selectSnapshot(QuestsState.lastScrapeSummary)).toEqual(summary);
    expect(questsApi.getTraders).toHaveBeenCalled();
  });
});
