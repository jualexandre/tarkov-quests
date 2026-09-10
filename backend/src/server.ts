import "dotenv/config";
import { join } from "node:path";
import { getPrismaClient } from "./shared/prisma-client";
import { PrismaTraderRepository } from "./features/traders/trader.repository";
import { PrismaQuestRepository } from "./features/quests/quest.repository";
import { createScraperService, fetchQuestsPageJson } from "./features/scraper/scraper.service";
import { createImageDownloader } from "./features/scraper/image-downloader";
import { createApp } from "./shared/http/app";

const dataDir = process.env.DATA_DIR ?? "./data";
const traderImagesDir = join(dataDir, "trader-images");

const prisma = getPrismaClient();
const traderRepository = new PrismaTraderRepository(prisma);
const questRepository = new PrismaQuestRepository(prisma);
const downloadTraderImage = createImageDownloader({ dir: traderImagesDir });
const scraperService = createScraperService({
  traderRepository,
  questRepository,
  fetchQuestsPageJson,
  downloadTraderImage,
});

const app = createApp({ questRepository, scraperService, traderImagesDir });
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
