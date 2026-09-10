import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsPageComponent } from "./quests-page.component";
import { QuestsState } from "../state/quests.state";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto } from "../../../core/api/quests.api";

const STORAGE_KEY = "tarkov-quests.selectedTraderId";

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
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("app-quest-table")?.textContent).toContain("Prapor");
  });

  it("restores the previously selected trader from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "2");
    setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("app-quest-table")?.textContent).toContain("Therapist");
  });

  it("falls back to the first trader when the stored id no longer matches any trader", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("app-quest-table")?.textContent).toContain("Prapor");
  });

  it("persists the selected trader to localStorage and switches the displayed table", () => {
    setup();
    fixture.componentInstance.onTraderSelected(2);
    fixture.detectChanges();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("2");
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("app-quest-table")?.textContent).toContain("Therapist");
  });

  it("dispatches RunScrape when the scrape button is clicked", () => {
    setup();
    questsApi.runScrape.mockReturnValue(of({ added: 0, updated: 0, deactivated: 0, totalQuests: 0 }));
    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.click();
    expect(questsApi.runScrape).toHaveBeenCalled();
  });
});
