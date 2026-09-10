import type { PrismaClient } from "@prisma/client";
import type {
  Quest,
  QuestRepository,
  TraderWithQuests,
  UpsertQuestInput,
} from "./quest.types";

function toQuest(row: {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string;
  rewards: string;
  requiredItems: string;
  requirements: string;
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}): Quest {
  return {
    ...row,
    objectives: JSON.parse(row.objectives),
    rewards: JSON.parse(row.rewards),
    requiredItems: JSON.parse(row.requiredItems),
    requirements: JSON.parse(row.requirements),
  };
}

export class PrismaQuestRepository implements QuestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertBySlug(input: UpsertQuestInput): Promise<Quest> {
    const data = {
      traderId: input.traderId,
      name: input.name,
      wikiUrl: input.wikiUrl,
      objectives: JSON.stringify(input.objectives),
      rewards: JSON.stringify(input.rewards),
      requiredItems: JSON.stringify(input.requiredItems),
      requirements: JSON.stringify(input.requirements),
      active: true,
      lastSeenAt: new Date(),
    };
    const row = await this.prisma.quest.upsert({
      where: { wikiSlug: input.wikiSlug },
      create: { ...data, wikiSlug: input.wikiSlug },
      update: data,
    });
    return toQuest(row);
  }

  async updateCompleted(id: number, completed: boolean): Promise<Quest> {
    const row = await this.prisma.quest.update({ where: { id }, data: { completed } });
    return toQuest(row);
  }

  async findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]> {
    const traders = await this.prisma.trader.findMany({
      orderBy: { tabOrder: "asc" },
      include: { quests: { where: { active: true }, orderBy: { id: "asc" } } },
    });
    return traders.map((trader) => ({
      id: trader.id,
      name: trader.name,
      slug: trader.slug,
      tabOrder: trader.tabOrder,
      imageUrl: trader.imageUrl,
      quests: trader.quests.map(toQuest),
    }));
  }

  async deactivateNotIn(seenSlugs: string[]): Promise<number> {
    const result = await this.prisma.quest.updateMany({
      where: { wikiSlug: { notIn: seenSlugs }, active: true },
      data: { active: false },
    });
    return result.count;
  }
}
