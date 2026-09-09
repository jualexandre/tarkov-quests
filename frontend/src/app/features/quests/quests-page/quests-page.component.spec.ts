import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsPageComponent } from "./quests-page.component";
import { QuestsState } from "../state/quests.state";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto } from "../../../core/api/quests.api";

describe("QuestsPageComponent", () => {
  let fixture: ComponentFixture<QuestsPageComponent>;
  let questsApi: { getTraders: Mock; updateQuestCompleted: Mock; runScrape: Mock };

  const trader: TraderDto = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, quests: [] };

  beforeEach(() => {
    questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    questsApi.getTraders.mockReturnValue(of([trader]));

    TestBed.configureTestingModule({
      imports: [QuestsPageComponent, NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    });

    fixture = TestBed.createComponent(QuestsPageComponent);
    fixture.detectChanges();
  });

  it("loads traders on init and renders one trader-column per trader", () => {
    expect(questsApi.getTraders).toHaveBeenCalled();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll("app-trader-column").length).toBe(1);
  });

  it("dispatches RunScrape when the scrape button is clicked", () => {
    questsApi.runScrape.mockReturnValue(of({ added: 0, updated: 0, deactivated: 0, totalQuests: 0 }));
    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.click();
    expect(questsApi.runScrape).toHaveBeenCalled();
  });
});
