import express, { type Express } from "express";
import type { QuestRepository } from "../../features/quests/quest.types";
import type { ScraperService } from "../../features/scraper/scraper.types";
import { createTraderRouter } from "../../features/traders/trader.routes";
import { createQuestRouter } from "../../features/quests/quest.routes";
import { createScraperRouter } from "../../features/scraper/scraper.routes";
import { errorHandler } from "./error-handler";

export interface AppDeps {
  questRepository: QuestRepository;
  scraperService: ScraperService;
  traderImagesDir: string;
  itemImagesDir: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use("/api/trader-images", express.static(deps.traderImagesDir));
  app.use("/api/item-images", express.static(deps.itemImagesDir));
  app.use("/api/traders", createTraderRouter(deps.questRepository));
  app.use("/api/quests", createQuestRouter(deps.questRepository));
  app.use("/api/scrape", createScraperRouter(deps.scraperService));

  app.use(errorHandler);
  return app;
}
