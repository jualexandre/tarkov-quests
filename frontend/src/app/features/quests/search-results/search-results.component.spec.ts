import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SearchResultsComponent } from "./search-results.component";
import type { QuestDto } from "../../../core/api/quests.api";

type SearchResultDto = QuestDto & { traderName: string; traderImageUrl: string | null };

describe("SearchResultsComponent", () => {
  let fixture: ComponentFixture<SearchResultsComponent>;

  const results: SearchResultDto[] = [
    {
      id: 1,
      traderId: 1,
      traderName: "Prapor",
      traderImageUrl: "/api/trader-images/prapor.png",
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
    {
      id: 2,
      traderId: 2,
      traderName: "Therapist",
      traderImageUrl: null,
      name: "Shortage",
      wikiSlug: "Shortage",
      wikiUrl: "/wiki/Shortage",
      objectives: ["Find 3 Bandages"],
      rewards: ["+800 EXP"],
      requiredItems: [],
      completed: false,
      active: true,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SearchResultsComponent] });
    fixture = TestBed.createComponent(SearchResultsComponent);
    fixture.componentInstance.results = results;
    fixture.detectChanges();
  });

  it("renders a Trader / Quest / Objectives / Rewards header", () => {
    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Trader", "Quest", "Objectives", "Rewards"]);
  });

  it("renders one row per matching quest with its trader name, objectives and rewards", () => {
    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("Prapor");
    expect(rows[0].textContent).toContain("Debut");
    expect(rows[0].textContent).toContain("Eliminate 5 Scavs");
    expect(rows[0].textContent).toContain("+1200 EXP");
    expect(rows[1].textContent).toContain("Therapist");
    expect(rows[1].textContent).toContain("Shortage");
  });

  it("renders the trader's portrait image in the Trader cell when imageUrl is set", () => {
    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelectorAll("tbody tr")[0];
    const img = row.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/trader-images/prapor.png");
  });

  it("renders a fallback initial instead of an image when the trader's imageUrl is null", () => {
    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelectorAll("tbody tr")[1];
    expect(row.querySelector("img")).toBeNull();
    expect(row.textContent).toContain("T");
  });

  it("shows a placeholder row when there are no matching results", () => {
    fixture.componentRef.setInput("results", []);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("No quests found matching your search.");
  });

  it("emits questToggled with the new completed value when a checkbox changes", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.questToggled.subscribe((v) => emitted.push(v));

    const el: HTMLElement = fixture.nativeElement;
    const checkbox = el.querySelectorAll("input[type=checkbox]")[1] as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([{ id: 2, completed: true }]);
  });

  it("moves completed quests to the end", () => {
    fixture.componentRef.setInput("results", [
      { ...results[0], completed: true },
      results[1],
    ]);
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr");
    expect(rows[0].textContent).toContain("Shortage");
    expect(rows[1].textContent).toContain("Debut");
  });
});
