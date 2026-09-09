import { Router } from "express";
import type { ScraperService } from "./scraper.types";

export function createScraperRouter(scraperService: ScraperService): Router {
  const router = Router();

  router.post("/", async (_req, res, next) => {
    try {
      const summary = await scraperService.runScrape();
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
