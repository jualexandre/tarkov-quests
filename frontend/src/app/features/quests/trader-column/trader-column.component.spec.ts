import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TraderColumnComponent } from "./trader-column.component";
import type { TraderDto } from "../../../core/api/quests.api";

describe("TraderColumnComponent", () => {
  let fixture: ComponentFixture<TraderColumnComponent>;

  const trader: TraderDto = {
    id: 1,
    name: "Prapor",
    slug: "prapor",
    tabOrder: 0,
    quests: [
      {
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
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TraderColumnComponent] });
    fixture = TestBed.createComponent(TraderColumnComponent);
    fixture.componentInstance.trader = trader;
    fixture.detectChanges();
  });

  it("renders the trader name and one quest item per quest", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Prapor");
    expect(el.querySelectorAll("app-quest-item").length).toBe(1);
  });

  it("re-emits questToggled with the quest id when a quest-item toggles", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.questToggled.subscribe((v) => emitted.push(v));

    fixture.componentInstance.onQuestToggle(1, true);

    expect(emitted).toEqual([{ id: 1, completed: true }]);
  });
});
