import { Router } from "express";
import type { QuestRepository } from "../quests/quest.types";
import { mapTraderForResponse } from "../quests/quest-response";

export function createTraderRouter(questRepository: QuestRepository): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const traders = await questRepository.findAllActiveGroupedByTrader();
      res.json(traders.map(mapTraderForResponse));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
