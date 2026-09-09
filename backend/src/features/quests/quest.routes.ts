import { Router } from "express";
import type { QuestRepository } from "./quest.types";

export function createQuestRouter(questRepository: QuestRepository): Router {
  const router = Router();

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "id must be a number" });
        return;
      }
      const body = req.body ?? {};
      const { completed } = body;
      if (typeof completed !== "boolean") {
        res.status(400).json({ error: "completed must be a boolean" });
        return;
      }
      const quest = await questRepository.updateCompleted(id, completed);
      res.json(quest);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
