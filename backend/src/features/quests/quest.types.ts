import type { Trader } from "../traders/trader.types";

export interface RequiredItem {
  kind: "item";
  name: string;
  wikiUrl: string | null;
  iconUrl: string | null;
  // null when the wiki's table has no Amount column at all (e.g. an item that
  // must merely be used/worn, not collected in a specific quantity).
  amount: number | null;
  requirement: string;
  findInRaid: boolean;
  notes: string;
}

// The wiki separates alternative item options with a single-cell row (e.g.
// "Flare - You only need one of the below options", "OR") instead of nesting
// them. Kept as its own entry, in sequence with the items, so the UI can
// reproduce the wiki's grouping verbatim.
export interface RequiredItemDivider {
  kind: "divider";
  label: string;
}

export type RequiredItemEntry = RequiredItem | RequiredItemDivider;

export interface QuestRequirements {
  minLevel: number | null;
  prerequisiteQuestSlugs: string[];
  loyaltyNotes: string[];
}

export const EMPTY_QUEST_REQUIREMENTS: QuestRequirements = {
  minLevel: null,
  prerequisiteQuestSlugs: [],
  loyaltyNotes: [],
};

export interface Quest {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemEntry[];
  requirements: QuestRequirements;
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
  requiredItems: RequiredItemEntry[];
  requirements: QuestRequirements;
}

export interface QuestRepository {
  upsertBySlug(input: UpsertQuestInput): Promise<Quest>;
  updateCompleted(id: number, completed: boolean): Promise<Quest>;
  findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]>;
  deactivateNotIn(seenSlugs: string[]): Promise<number>;
}
