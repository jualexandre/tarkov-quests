import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting, HttpTestingController } from "@angular/common/http/testing";
import { QuestsApi } from "./quests.api";
import type { TraderDto, ScrapeSummaryDto } from "./quests.api";

describe("QuestsApi", () => {
  let api: QuestsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QuestsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(QuestsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("getTraders() GETs /api/traders", () => {
    const traders: TraderDto[] = [];
    api.getTraders().subscribe((result) => expect(result).toBe(traders));
    const req = httpMock.expectOne("/api/traders");
    expect(req.request.method).toBe("GET");
    req.flush(traders);
  });

  it("updateQuestCompleted() PATCHes /api/quests/:id", () => {
    api.updateQuestCompleted(5, true).subscribe();
    const req = httpMock.expectOne("/api/quests/5");
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ completed: true });
    req.flush({});
  });

  it("runScrape() POSTs /api/scrape", () => {
    const summary: ScrapeSummaryDto = {
      added: 1,
      updated: 2,
      deactivated: 0,
      totalQuests: 3,
      detailFetchFailures: 0,
    };
    api.runScrape().subscribe((result) => expect(result).toEqual(summary));
    const req = httpMock.expectOne("/api/scrape");
    expect(req.request.method).toBe("POST");
    req.flush(summary);
  });
});
