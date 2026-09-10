import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestsPage } from "./wiki-parser";

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
});
