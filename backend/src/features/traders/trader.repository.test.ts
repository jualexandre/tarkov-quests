import { describe, it, expect } from "vitest";
import { PrismaTraderRepository } from "./trader.repository";
import { getPrismaClient } from "../../shared/prisma-client";

describe("PrismaTraderRepository", () => {
  const repo = new PrismaTraderRepository(getPrismaClient());

  it("creates a trader on first upsert", async () => {
    const trader = await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    expect(trader.id).toBeGreaterThan(0);
    expect(trader.name).toBe("Prapor");
    expect(trader.tabOrder).toBe(0);
  });

  it("updates tabOrder on a second upsert with the same name instead of duplicating", async () => {
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 5 });
    const all = await repo.findAll();
    expect(all.filter((t) => t.name === "Prapor")).toHaveLength(1);
    expect(all.find((t) => t.name === "Prapor")?.tabOrder).toBe(5);
  });

  it("findAll returns traders ordered by tabOrder", async () => {
    await repo.upsertByName({ name: "Therapist", slug: "therapist", tabOrder: 1 });
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    const all = await repo.findAll();
    expect(all.map((t) => t.name)).toEqual(["Prapor", "Therapist"]);
  });
});
