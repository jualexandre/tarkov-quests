import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository } from "../quests/quest.types";
import type { ScraperService } from "./scraper.types";

describe("POST /api/scrape", () => {
  it("runs the scraper and returns its summary", async () => {
    const summary = { added: 2, updated: 10, deactivated: 1, totalQuests: 12 };
    const scraperService: ScraperService = { runScrape: vi.fn().mockResolvedValue(summary) };
    const questRepository = {} as unknown as QuestRepository;

    const app = createApp({ questRepository, scraperService });
    const response = await request(app).post("/api/scrape");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });
});
