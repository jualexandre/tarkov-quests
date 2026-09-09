import "dotenv/config";
import { getPrismaClient } from "./shared/prisma-client";
import { PrismaTraderRepository } from "./features/traders/trader.repository";
import { PrismaQuestRepository } from "./features/quests/quest.repository";
import { createScraperService, fetchQuestsPageJson } from "./features/scraper/scraper.service";
import { createApp } from "./shared/http/app";

const prisma = getPrismaClient();
const traderRepository = new PrismaTraderRepository(prisma);
const questRepository = new PrismaQuestRepository(prisma);
const scraperService = createScraperService({ traderRepository, questRepository, fetchQuestsPageJson });

const app = createApp({ questRepository, scraperService });
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
