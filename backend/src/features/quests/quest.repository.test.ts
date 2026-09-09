import { describe, it, expect, beforeEach } from "vitest";
import { getPrismaClient } from "../../shared/prisma-client";
import { PrismaTraderRepository } from "../traders/trader.repository";
import { PrismaQuestRepository } from "./quest.repository";

describe("PrismaQuestRepository", () => {
  const prisma = getPrismaClient();
  const traders = new PrismaTraderRepository(prisma);
  const repo = new PrismaQuestRepository(prisma);
  let traderId: number;

  beforeEach(async () => {
    const trader = await traders.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    traderId = trader.id;
  });

  it("creates a quest on first upsert with completed defaulting to false", async () => {
    const quest = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["Locate the Utyos machine gun"],
      rewards: ["+1,600 EXP"],
    });
    expect(quest.completed).toBe(false);
    expect(quest.active).toBe(true);
    expect(quest.objectives).toEqual(["Locate the Utyos machine gun"]);
  });

  it("preserves completed=true across a second upsert of the same wikiSlug", async () => {
    const first = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a"],
      rewards: ["b"],
    });
    await repo.updateCompleted(first.id, true);

    const second = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans (renamed)",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a", "c"],
      rewards: ["b"],
    });

    expect(second.id).toBe(first.id);
    expect(second.completed).toBe(true);
    expect(second.name).toBe("Shooting Cans (renamed)");
    expect(second.objectives).toEqual(["a", "c"]);
  });

  it("findAllActiveGroupedByTrader returns only active quests, grouped and ordered by trader tabOrder", async () => {
    const therapist = await traders.upsertByName({ name: "Therapist", slug: "therapist", tabOrder: 1 });
    await repo.upsertBySlug({
      traderId,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
    });
    const inactiveQuest = await repo.upsertBySlug({
      traderId: therapist.id,
      name: "Old Quest",
      wikiSlug: "Old_Quest",
      wikiUrl: "/wiki/Old_Quest",
      objectives: [],
      rewards: [],
    });
    await repo.deactivateNotIn(["Debut"]);

    const grouped = await repo.findAllActiveGroupedByTrader();
    expect(grouped.map((t) => t.name)).toEqual(["Prapor", "Therapist"]);
    expect(grouped[0].quests.map((q) => q.wikiSlug)).toEqual(["Debut"]);
    expect(grouped[1].quests).toEqual([]);
    expect(inactiveQuest).toBeDefined();
  });

  it("deactivateNotIn returns the count of quests it deactivated", async () => {
    await repo.upsertBySlug({
      traderId,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
    });
    await repo.upsertBySlug({
      traderId,
      name: "Delivery from the Past",
      wikiSlug: "Delivery_from_the_Past",
      wikiUrl: "/wiki/Delivery_from_the_Past",
      objectives: [],
      rewards: [],
    });

    const deactivatedCount = await repo.deactivateNotIn(["Debut"]);
    expect(deactivatedCount).toBe(1);
  });
});
