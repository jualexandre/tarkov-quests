import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestTableComponent } from "./quest-table.component";
import type { TraderDto } from "../../../core/api/quests.api";

describe("QuestTableComponent", () => {
  let fixture: ComponentFixture<QuestTableComponent>;

  const trader: TraderDto = {
    id: 1,
    name: "Prapor",
    slug: "prapor",
    tabOrder: 0,
    imageUrl: null,
    quests: [
      {
        id: 1,
        traderId: 1,
        name: "Debut",
        wikiSlug: "Debut",
        wikiUrl: "/wiki/Debut",
        objectives: ["Eliminate 5 Scavs"],
        rewards: ["+1200 EXP"],
        requiredItems: [],
        completed: false,
        active: true,
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestTableComponent] });
    fixture = TestBed.createComponent(QuestTableComponent);
    fixture.componentInstance.trader = trader;
    fixture.detectChanges();
  });

  it("renders a Quest / Objectives / Rewards header", () => {
    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Quest", "Objectives", "Rewards"]);
  });

  it("renders the quest name as plain text alongside a 'Show on Wiki' link to the quest's wiki page", () => {
    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelector("tbody tr") as HTMLElement;
    expect(row.textContent).toContain("Debut");

    const link = row.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toContain("Show on Wiki");
    expect(link.href).toContain("/wiki/Debut");
  });

  it("always shows objectives and rewards without needing to expand anything", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Eliminate 5 Scavs");
    expect(el.textContent).toContain("+1200 EXP");
  });

  it("shows a placeholder row when the trader has no active quests", () => {
    fixture.componentRef.setInput("trader", { ...trader, quests: [] });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("No active quests.");
  });

  it("emits questToggled with the new completed value when the checkbox changes", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.questToggled.subscribe((v) => emitted.push(v));

    const el: HTMLElement = fixture.nativeElement;
    const checkbox = el.querySelector("input[type=checkbox]") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([{ id: 1, completed: true }]);
  });

  describe("ordering completed quests to the end", () => {
    function buildTrader(completedIds: number[]): TraderDto {
      return {
        ...trader,
        quests: [1, 2, 3, 4, 5].map((n) => ({
          id: n,
          traderId: 1,
          name: `Quest ${n}`,
          wikiSlug: `Quest_${n}`,
          wikiUrl: `/wiki/Quest_${n}`,
          objectives: [],
          rewards: [],
          requiredItems: [],
          completed: completedIds.includes(n),
          active: true,
          lastSeenAt: "2026-01-01T00:00:00.000Z",
        })),
      };
    }

    function renderedQuestNames(): string[] {
      const el: HTMLElement = fixture.nativeElement;
      return Array.from(el.querySelectorAll("tbody tr td:first-child p")).map((p) => p.textContent?.trim() ?? "");
    }

    it("keeps quests in their original order when none are completed", () => {
      fixture.componentRef.setInput("trader", buildTrader([]));
      fixture.detectChanges();
      expect(renderedQuestNames()).toEqual(["Quest 1", "Quest 2", "Quest 3", "Quest 4", "Quest 5"]);
    });

    it("moves a completed quest to the end", () => {
      fixture.componentRef.setInput("trader", buildTrader([1]));
      fixture.detectChanges();
      expect(renderedQuestNames()).toEqual(["Quest 2", "Quest 3", "Quest 4", "Quest 5", "Quest 1"]);
    });

    it("appends the next completed quest after the previously completed ones", () => {
      fixture.componentRef.setInput("trader", buildTrader([1, 3]));
      fixture.detectChanges();
      expect(renderedQuestNames()).toEqual(["Quest 2", "Quest 4", "Quest 5", "Quest 1", "Quest 3"]);
    });
  });
});
