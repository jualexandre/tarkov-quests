import { shortenLoyaltyNotes } from "./loyalty-notes";
import type { Quest, TraderWithQuests } from "./quest.types";

export function mapQuestForResponse(quest: Quest): Quest {
  return {
    ...quest,
    requirements: {
      ...quest.requirements,
      loyaltyNotes: shortenLoyaltyNotes(quest.requirements.loyaltyNotes),
    },
  };
}

export function mapTraderForResponse(trader: TraderWithQuests): TraderWithQuests {
  return {
    ...trader,
    quests: trader.quests.map(mapQuestForResponse),
  };
}
