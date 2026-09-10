import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestsPage, parseRequiredItems } from "./wiki-parser";

function loadFixtureJson(): string {
  return readFileSync(
    join(__dirname, "../../../test/fixtures/quests-page.json"),
    "utf-8"
  );
}

describe("parseQuestsPage", () => {
  it("parses traders in tab order starting with Prapor", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    expect(traders.length).toBeGreaterThanOrEqual(10);
    expect(traders[0].name).toBe("Prapor");
    expect(traders[0].tabOrder).toBe(0);
    expect(traders[1].tabOrder).toBe(1);
  });

  it("parses quest name, wikiSlug and wikiUrl from the first Prapor quest", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const shootingCans = prapor.quests.find((q) => q.name === "Shooting Cans")!;
    expect(shootingCans).toBeDefined();
    expect(shootingCans.wikiSlug).toBe("Shooting_Cans");
    expect(shootingCans.wikiUrl).toBe("/wiki/Shooting_Cans");
  });

  it("parses objectives and rewards as non-empty string lists", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const shootingCans = prapor.quests.find((q) => q.name === "Shooting Cans")!;
    expect(shootingCans.objectives.length).toBeGreaterThan(0);
    expect(shootingCans.objectives[0]).toContain("Utyos");
    expect(shootingCans.rewards.length).toBeGreaterThan(0);
  });

  it("pairs every trader tab with its own quest-tracking table, not an unrelated wikitable", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    expect(traders.length).toBe(11);
    expect(traders.every((t) => t.quests.length > 0)).toBe(true);
  });

  it("parses the trader portrait URL from the tab's img src when it is not lazy-loaded", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    expect(prapor.imageUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/6/6b/Prapor_Portrait.png/revision/latest/scale-to-width-down/105?cb=20180425012550"
    );
  });

  it("prefers the img's data-src over the lazy-load placeholder src", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const therapist = traders.find((t) => t.name === "Therapist")!;
    expect(therapist.imageUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/c/c7/Therapist_Portrait.png/revision/latest/scale-to-width-down/105?cb=20221124232039"
    );
  });

  it("keeps item/trader wiki links as absolute, new-tab anchors in objectives and rewards", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const shootingCans = prapor.quests.find((q) => q.name === "Shooting Cans")!;
    expect(shootingCans.objectives[0]).toContain(
      '<a href="https://escapefromtarkov.fandom.com/wiki/NSV_Utyos_12.7x108_heavy_machine_gun"'
    );
    expect(shootingCans.objectives[0]).toContain('target="_blank"');
  });

  it("renders 'in raid' in red", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const punisher3 = traders
      .flatMap((t) => t.quests)
      .find((q) => q.name === "The Punisher - Part 3")!;
    const inRaidObjective = punisher3.objectives.find((o) => o.includes("Lower half-mask"))!;
    expect(inRaidObjective).toContain('<span class="text-red-400">in raid</span>');
  });

  it("nests optional sub-objectives as an indented sub-list instead of separate top-level entries", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const iceCreamCones = prapor.quests.find((q) => q.name === "Ice Cream Cones")!;

    expect(iceCreamCones.objectives).toHaveLength(2);
    const [findObjective, handOverObjective] = iceCreamCones.objectives;
    expect(findObjective).toContain('<span class="text-red-400">in raid</span>');
    expect(findObjective).toContain('<ul class="list-disc list-inside space-y-0.5 pl-4 mt-0.5">');
    expect(findObjective).toContain("key to the bunker");
    expect(findObjective).toContain("locked bunker");
    expect(handOverObjective).toContain("Hand over");
  });

  it("does not link 'in raid' to the wiki's Found_in_raid glossary page", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const punisher3 = traders
      .flatMap((t) => t.quests)
      .find((q) => q.name === "The Punisher - Part 3")!;
    const inRaidObjective = punisher3.objectives.find((o) => o.includes("Lower half-mask"))!;
    expect(inRaidObjective).not.toContain("Found_in_raid");
    expect(inRaidObjective).toContain('<span class="text-red-400">in raid</span>');
    expect(inRaidObjective).not.toMatch(/<a[^>]*><span class="text-red-400">/);
  });

  it("renders positive rep rewards in green and negative ones in red", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const aquarius = traders.flatMap((t) => t.quests).find((q) => q.name === "Operation Aquarius")!;
    expect(aquarius.rewards.some((r) => r.includes('text-green-400"><b>+0.03</b></span>'))).toBe(true);
    expect(aquarius.rewards.some((r) => r.includes('text-red-400"><b>-0.02</b></span>'))).toBe(true);
  });

  it("does not link EXP rewards to the wiki's EXP glossary page", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const shootingCans = traders
      .flatMap((t) => t.quests)
      .find((q) => q.name === "Shooting Cans")!;
    const expReward = shootingCans.rewards.find((r) => r.includes("EXP"))!;
    expect(expReward).not.toContain("<a");
    expect(expReward).toContain("EXP");
  });
});

describe("parseRequiredItems", () => {
  function loadDetailFixtureJson(filename: string): string {
    return readFileSync(join(__dirname, "../../../test/fixtures", filename), "utf-8");
  }

  it("returns an empty array when the quest page has no Related Quest Items table", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-without-items.json"));
    expect(items).toEqual([]);
  });

  it("parses a 'find and keep' item with no find-in-raid requirement", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const key = items.find((i) => i.name === "Health Resort west wing room 306 key")!;
    expect(key).toBeDefined();
    expect(key.wikiUrl).toBe("https://escapefromtarkov.fandom.com/wiki/Health_Resort_west_wing_room_306_key");
    expect(key.iconUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/7/71/WestWing306KeyIcon.png/revision/latest?cb=20220707215218"
    );
    expect(key.amount).toBe(1);
    expect(key.requirement).toBe("Required");
    expect(key.findInRaid).toBe(false);
    expect(key.notes).toContain("Unlocks Health Resort west wing room 306");
  });

  it("parses a hand-over item that requires find-in-raid", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const folder = items.find((i) => i.name === "Secure Folder 0060")!;
    expect(folder).toBeDefined();
    expect(folder.wikiUrl).toBe("https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060");
    expect(folder.iconUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/d/d0/Docs_0060_icon.png/revision/latest?cb=20221012071107"
    );
    expect(folder.amount).toBe(1);
    expect(folder.requirement).toBe("Handover item");
    expect(folder.findInRaid).toBe(true);
    expect(folder.notes).toContain("quest item");
  });

  it("keeps links inside notes absolute and opening in a new tab", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const key = items.find((i) => i.name === "Health Resort west wing room 306 key")!;
    expect(key.notes).toContain('<a href="https://escapefromtarkov.fandom.com/wiki/Shoreline"');
    expect(key.notes).toContain('target="_blank"');
  });
});
