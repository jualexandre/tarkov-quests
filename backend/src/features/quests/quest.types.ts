import type { Trader } from "../traders/trader.types";

export interface RequiredItem {
  name: string;
  wikiUrl: string | null;
  iconUrl: string | null;
  amount: number;
  requirement: string;
  findInRaid: boolean;
  notes: string;
}

export interface Quest {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItem[];
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}

export interface TraderWithQuests extends Trader {
  quests: Quest[];
}

export interface UpsertQuestInput {
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItem[];
}

export interface QuestRepository {
  upsertBySlug(input: UpsertQuestInput): Promise<Quest>;
  updateCompleted(id: number, completed: boolean): Promise<Quest>;
  findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]>;
  deactivateNotIn(seenSlugs: string[]): Promise<number>;
}
