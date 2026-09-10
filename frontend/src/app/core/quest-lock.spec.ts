import { evaluateRequirements } from "./quest-lock";

describe("evaluateRequirements", () => {
  const noRequirements = { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] };

  it("is not locked and levelMet is null when there is no level requirement and no player level", () => {
    const status = evaluateRequirements(noRequirements, null, new Map());
    expect(status).toEqual({ levelMet: null, prerequisites: [], locked: false });
  });

  it("levelMet is null (unknown) when a level is required but the player level isn't set", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, null, new Map());
    expect(status.levelMet).toBeNull();
    expect(status.locked).toBe(false);
  });

  it("locks when the player's level is below the required level", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, 20, new Map());
    expect(status.levelMet).toBe(false);
    expect(status.locked).toBe(true);
  });

  it("does not lock when the player's level meets the requirement", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, 30, new Map());
    expect(status.levelMet).toBe(true);
    expect(status.locked).toBe(false);
  });

  it("locks when a prerequisite quest is known and not completed", () => {
    const completionBySlug = new Map([["Debut", { name: "Debut", completed: false }]]);
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Debut"] },
      null,
      completionBySlug
    );
    expect(status.prerequisites).toEqual([{ name: "Debut", completed: false }]);
    expect(status.locked).toBe(true);
  });

  it("does not lock when the known prerequisite quest is completed", () => {
    const completionBySlug = new Map([["Debut", { name: "Debut", completed: true }]]);
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Debut"] },
      null,
      completionBySlug
    );
    expect(status.locked).toBe(false);
  });

  it("ignores a prerequisite slug that isn't in the completion map", () => {
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Unknown_Quest"] },
      null,
      new Map()
    );
    expect(status.prerequisites).toEqual([]);
    expect(status.locked).toBe(false);
  });
});
