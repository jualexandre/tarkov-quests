import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository, TraderWithQuests } from "../quests/quest.types";
import type { ScraperService } from "../scraper/scraper.types";

describe("GET /api/traders", () => {
  it("returns traders with their active quests", async () => {
    const grouped: TraderWithQuests[] = [
      {
        id: 1,
        name: "Prapor",
        slug: "prapor",
        tabOrder: 0,
        imageUrl: "/api/trader-images/prapor.png",
        quests: [
          {
            id: 1,
            traderId: 1,
            name: "Debut",
            wikiSlug: "Debut",
            wikiUrl: "/wiki/Debut",
            objectives: ["Eliminate 5 Scavs"],
            rewards: ["+1200 EXP"],
            requiredItems: [],
            completed: false,
            active: true,
            lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ];
    const questRepository = {
      findAllActiveGroupedByTrader: vi.fn().mockResolvedValue(grouped),
    } as unknown as QuestRepository;
    const scraperService = {} as ScraperService;

    const app = createApp({
      questRepository,
      scraperService,
      traderImagesDir: "/tmp/test-trader-images",
      itemImagesDir: "/tmp/test-item-images",
    });
    const response = await request(app).get("/api/traders");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe("Prapor");
    expect(response.body[0].imageUrl).toBe("/api/trader-images/prapor.png");
    expect(response.body[0].quests[0].wikiSlug).toBe("Debut");
  });
});
