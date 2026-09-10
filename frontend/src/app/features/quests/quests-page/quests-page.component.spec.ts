import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsPageComponent } from "./quests-page.component";
import { QuestsState } from "../state/quests.state";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto } from "../../../core/api/quests.api";

const STORAGE_KEY = "tarkov-quests.selectedTraderId";

function buildQuest(overrides: Partial<TraderDto["quests"][number]> = {}): TraderDto["quests"][number] {
  return {
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
    ...overrides,
  };
}

describe("QuestsPageComponent", () => {
  let fixture: ComponentFixture<QuestsPageComponent>;
  let questsApi: { getTraders: Mock; updateQuestCompleted: Mock; runScrape: Mock };

  const traders: TraderDto[] = [
    { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, imageUrl: null, quests: [] },
    { id: 2, name: "Therapist", slug: "therapist", tabOrder: 1, imageUrl: null, quests: [] },
  ];

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [QuestsPageComponent, NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    });

    fixture = TestBed.createComponent(QuestsPageComponent);
    fixture.detectChanges();
  }

  function selectedTraderName(): string | undefined {
    const el: HTMLElement = fixture.nativeElement;
    const button = Array.from(el.querySelectorAll("app-trader-tabs button")).find(
      (b) => b.getAttribute("aria-pressed") === "true"
    );
    return button?.textContent?.trim();
  }

  beforeEach(() => {
    localStorage.clear();
    questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    questsApi.getTraders.mockReturnValue(of(traders));
  });

  it("loads traders on init and renders one trader tab per trader plus a single quest table", () => {
    setup();
    expect(questsApi.getTraders).toHaveBeenCalled();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("app-trader-tabs")).not.toBeNull();
    expect(el.querySelectorAll("app-quest-table").length).toBe(1);
  });

  it("defaults to the first trader when nothing is stored", () => {
    setup();
    expect(selectedTraderName()).toContain("Prapor");
  });

  it("restores the previously selected trader from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "2");
    setup();
    expect(selectedTraderName()).toContain("Therapist");
  });

  it("falls back to the first trader when the stored id no longer matches any trader", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    setup();
    expect(selectedTraderName()).toContain("Prapor");
  });

  it("persists the selected trader to localStorage and switches the displayed table", () => {
    setup();
    fixture.componentInstance.onTraderSelected(2);
    fixture.detectChanges();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("2");
    expect(selectedTraderName()).toContain("Therapist");
  });

  it("dispatches RunScrape when the scrape button is clicked", () => {
    setup();
    questsApi.runScrape.mockReturnValue(of({ added: 0, updated: 0, deactivated: 0, totalQuests: 0 }));
    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.click();
    expect(questsApi.runScrape).toHaveBeenCalled();
  });

  describe("searching by quest name", () => {
    const searchTraders: TraderDto[] = [
      {
        id: 1,
        name: "Prapor",
        slug: "prapor",
        tabOrder: 0,
        imageUrl: null,
        quests: [buildQuest({ id: 1, traderId: 1, name: "Debut" })],
      },
      {
        id: 2,
        name: "Therapist",
        slug: "therapist",
        tabOrder: 1,
        imageUrl: null,
        quests: [buildQuest({ id: 2, traderId: 2, name: "Shortage" })],
      },
    ];

    function searchInput(): HTMLInputElement {
      return fixture.nativeElement.querySelector("input[type=search]") as HTMLInputElement;
    }

    function typeSearch(value: string): void {
      const input = searchInput();
      input.value = value;
      input.dispatchEvent(new Event("input"));
      fixture.detectChanges();
    }

    beforeEach(() => {
      questsApi.getTraders.mockReturnValue(of(searchTraders));
      setup();
    });

    it("shows the trader tabs and quest table, and no search results, when the search box is empty", () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector("app-trader-tabs")).not.toBeNull();
      expect(el.querySelector("app-quest-table")).not.toBeNull();
      expect(el.querySelector("app-search-results")).toBeNull();
    });

    it("hides the trader tabs and shows matching quests from every trader, case-insensitively", () => {
      typeSearch("short");
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector("app-trader-tabs")).toBeNull();
      expect(el.querySelector("app-quest-table")).toBeNull();
      const results = el.querySelector("app-search-results");
      expect(results).not.toBeNull();
      expect(results?.textContent).toContain("Shortage");
      expect(results?.textContent).not.toContain("Debut");
    });

    it("restores the trader tabs and quest table once the search box is cleared", () => {
      typeSearch("short");
      typeSearch("");
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector("app-trader-tabs")).not.toBeNull();
      expect(el.querySelector("app-search-results")).toBeNull();
    });
  });
});
