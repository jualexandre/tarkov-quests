import express, { type Express } from "express";
import type { QuestRepository } from "../../features/quests/quest.types";
import type { ScraperService } from "../../features/scraper/scraper.types";
import { createTraderRouter } from "../../features/traders/trader.routes";
import { errorHandler } from "./error-handler";

export interface AppDeps {
  questRepository: QuestRepository;
  scraperService: ScraperService;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use("/api/traders", createTraderRouter(deps.questRepository));

  app.use(errorHandler);
  return app;
}
