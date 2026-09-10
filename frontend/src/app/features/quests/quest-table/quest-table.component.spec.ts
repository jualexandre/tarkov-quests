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

  it("renders the trader name heading and a table row with a wiki link per quest", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h2")?.textContent).toContain("Prapor");
    const link = el.querySelector("table a") as HTMLAnchorElement;
    expect(link.textContent).toContain("Debut");
    expect(link.href).toContain("/wiki/Debut");
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

  it("toggles objectives/rewards detail visibility when the detail button is clicked", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("Eliminate 5 Scavs");

    const detailButton = el.querySelector("button") as HTMLButtonElement;
    detailButton.click();
    fixture.detectChanges();
    expect(el.textContent).toContain("Eliminate 5 Scavs");
    expect(el.textContent).toContain("+1200 EXP");

    detailButton.click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain("Eliminate 5 Scavs");
  });
});
