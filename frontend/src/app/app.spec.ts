import { TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { of } from "rxjs";
import { vi } from "vitest";
import { App } from "./app";
import { QuestsState } from "./features/quests/state/quests.state";
import { QuestsApi } from "./core/api/quests.api";

describe("App", () => {
  beforeEach(async () => {
    const questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    questsApi.getTraders.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [App, NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    }).compileComponents();
  });

  it("should create the app", () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it("renders the quests page", () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector("app-quests-page")).toBeTruthy();
  });
});
