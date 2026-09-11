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
        requiredItems: [
          {
            kind: "item",
            name: "Secure Folder 0060",
            wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
            iconUrl: null,
            amount: 1,
            requirement: "Handover item",
            findInRaid: true,
            notes: "",
          },
        ],
        requirements: { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
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
    const row = el.querySelector("tbody tr:not([aria-hidden])") as HTMLElement;
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

  it("renders the quest's required items", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Secure Folder 0060");
  });

  it("shows a placeholder row when the trader has no active quests", () => {
    fixture.componentRef.setInput("trader", { ...trader, quests: [] });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("No active quests.");
  });

  it("puts a `quest-{id}` id on each quest's row so it can be scrolled into view", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("#quest-1")).not.toBeNull();
  });

  it("bubbles prerequisiteSelected up from a quest cell", () => {
    const lockedTrader: TraderDto = {
      ...trader,
      quests: [
        {
          ...trader.quests[0],
          requirements: { minLevel: null, prerequisiteQuestSlugs: ["Some_Other_Quest"], loyaltyNotes: [] },
        },
      ],
    };
    fixture.componentRef.setInput("trader", lockedTrader);
    fixture.componentRef.setInput(
      "completionBySlug",
      new Map([["Some_Other_Quest", { id: 9, traderId: 2, name: "Some Other Quest", completed: false }]])
    );
    fixture.detectChanges();

    const emitted: Array<{ id: number; traderId: number }> = [];
    fixture.componentInstance.prerequisiteSelected.subscribe((v) => emitted.push(v));
    const button = (fixture.nativeElement as HTMLElement).querySelector("button") as HTMLButtonElement;
    button.click();

    expect(emitted).toEqual([{ id: 9, traderId: 2 }]);
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

  it("passes playerLevel and completionBySlug down so a locked quest renders its lock icon", () => {
    const lockedTrader: TraderDto = {
      ...trader,
      quests: [
        {
          ...trader.quests[0],
          requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
        },
      ],
    };
    fixture.componentRef.setInput("trader", lockedTrader);
    fixture.componentRef.setInput("playerLevel", 10);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
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
          requirements: { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
          completed: completedIds.includes(n),
          active: true,
          lastSeenAt: "2026-01-01T00:00:00.000Z",
        })),
      };
    }

    function renderedQuestNames(): string[] {
      const el: HTMLElement = fixture.nativeElement;
      return Array.from(el.querySelectorAll("tbody tr td:first-child p")).map((p) => {
        const clone = p.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".stamp").forEach((stamp) => stamp.remove());
        return clone.textContent?.trim() ?? "";
      });
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
