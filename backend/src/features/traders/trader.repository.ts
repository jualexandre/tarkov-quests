import type { PrismaClient } from "@prisma/client";
import type { Trader, TraderRepository, UpsertTraderInput } from "./trader.types";

export class PrismaTraderRepository implements TraderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByName(data: UpsertTraderInput): Promise<Trader> {
    return this.prisma.trader.upsert({
      where: { name: data.name },
      create: data,
      update: { slug: data.slug, tabOrder: data.tabOrder, imageUrl: data.imageUrl },
    });
  }

  async findAll(): Promise<Trader[]> {
    return this.prisma.trader.findMany({ orderBy: { tabOrder: "asc" } });
  }
}
