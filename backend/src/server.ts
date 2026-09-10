import "dotenv/config";
import { join } from "node:path";
import { getPrismaClient } from "./shared/prisma-client";
import { PrismaTraderRepository } from "./features/traders/trader.repository";
import { PrismaQuestRepository } from "./features/quests/quest.repository";
import { createScraperService, fetchQuestsPageJson, fetchQuestDetailJson } from "./features/scraper/scraper.service";
import { createImageDownloader } from "./features/scraper/image-downloader";
import { createApp } from "./shared/http/app";

const dataDir = process.env.DATA_DIR ?? "./data";
const traderImagesDir = join(dataDir, "trader-images");
const itemImagesDir = join(dataDir, "item-images");

const prisma = getPrismaClient();
const traderRepository = new PrismaTraderRepository(prisma);
const questRepository = new PrismaQuestRepository(prisma);
const downloadTraderImage = createImageDownloader({ dir: traderImagesDir, publicPathPrefix: "/api/trader-images" });
const downloadItemImage = createImageDownloader({ dir: itemImagesDir, publicPathPrefix: "/api/item-images" });
const scraperService = createScraperService({
  traderRepository,
  questRepository,
  fetchQuestsPageJson,
  fetchQuestDetailJson,
  downloadTraderImage,
  downloadItemImage,
});

const app = createApp({ questRepository, scraperService, traderImagesDir, itemImagesDir });
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// A full scrape now fetches one detail page per quest (~500 requests); raise
// the default timeout so Node doesn't close the connection mid-scrape.
const SCRAPE_TIMEOUT_MS = 600_000;

const httpServer = app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
httpServer.timeout = SCRAPE_TIMEOUT_MS;
