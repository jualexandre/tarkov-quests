import type { QuestRequirementsDto } from "./api/quests.api";

export interface QuestCompletionInfo {
  name: string;
  completed: boolean;
}

export interface PrerequisiteStatus {
  name: string;
  completed: boolean;
}

export interface RequirementsStatus {
  levelMet: boolean | null;
  prerequisites: PrerequisiteStatus[];
  locked: boolean;
}

export function evaluateRequirements(
  requirements: QuestRequirementsDto,
  playerLevel: number | null,
  completionBySlug: ReadonlyMap<string, QuestCompletionInfo>
): RequirementsStatus {
  const levelMet =
    requirements.minLevel === null || playerLevel === null ? null : playerLevel >= requirements.minLevel;

  const prerequisites: PrerequisiteStatus[] = requirements.prerequisiteQuestSlugs
    .map((slug) => completionBySlug.get(slug))
    .filter((entry): entry is QuestCompletionInfo => entry !== undefined)
    .map((entry) => ({ name: entry.name, completed: entry.completed }));

  const locked = levelMet === false || prerequisites.some((p) => !p.completed);

  return { levelMet, prerequisites, locked };
}
