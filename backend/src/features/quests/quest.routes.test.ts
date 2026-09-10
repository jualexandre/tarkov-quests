import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository } from "./quest.types";
import type { ScraperService } from "../scraper/scraper.types";

describe("PATCH /api/quests/:id", () => {
  it("updates completed and returns the updated quest", async () => {
    const updatedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      completed: true,
      active: true,
      lastSeenAt: new Date(),
    };
    const questRepository = {
      updateCompleted: vi.fn().mockResolvedValue(updatedQuest),
    } as unknown as QuestRepository;
    const scraperService = {} as ScraperService;

    const app = createApp({ questRepository, scraperService, traderImagesDir: "/tmp/test-trader-images" });
    const response = await request(app).patch("/api/quests/1").send({ completed: true });

    expect(response.status).toBe(200);
    expect(response.body.completed).toBe(true);
    expect(questRepository.updateCompleted).toHaveBeenCalledWith(1, true);
  });

  it("returns 400 when completed is not a boolean", async () => {
    const questRepository = {} as unknown as QuestRepository;
    const scraperService = {} as ScraperService;
    const app = createApp({ questRepository, scraperService, traderImagesDir: "/tmp/test-trader-images" });

    const response = await request(app).patch("/api/quests/1").send({ completed: "yes" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when the id param is not numeric", async () => {
    const questRepository = {} as unknown as QuestRepository;
    const scraperService = {} as ScraperService;
    const app = createApp({ questRepository, scraperService, traderImagesDir: "/tmp/test-trader-images" });

    const response = await request(app).patch("/api/quests/abc").send({ completed: true });

    expect(response.status).toBe(400);
  });

  it("returns 400 when the request has no body", async () => {
    const questRepository = {} as unknown as QuestRepository;
    const scraperService = {} as ScraperService;
    const app = createApp({ questRepository, scraperService, traderImagesDir: "/tmp/test-trader-images" });

    const response = await request(app).patch("/api/quests/1").send();

    expect(response.status).toBe(400);
  });
});
