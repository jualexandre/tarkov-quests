import { Router } from "express";
import type { QuestRepository } from "../quests/quest.types";

export function createTraderRouter(questRepository: QuestRepository): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const traders = await questRepository.findAllActiveGroupedByTrader();
      res.json(traders);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
