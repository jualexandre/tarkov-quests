import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestsPage, parseRequiredItems } from "./wiki-parser";
import type { RequiredItem } from "../quests/quest.types";

function isRequiredItem(entry: { kind: "item" | "divider" }): entry is RequiredItem {
  return entry.kind === "item";
}

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
    const key = items.filter(isRequiredItem).find((i) => i.name === "Health Resort west wing room 306 key")!;
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
    const folder = items.filter(isRequiredItem).find((i) => i.name === "Secure Folder 0060")!;
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
    const key = items.filter(isRequiredItem).find((i) => i.name === "Health Resort west wing room 306 key")!;
    expect(key.notes).toContain('<a href="https://escapefromtarkov.fandom.com/wiki/Shoreline"');
    expect(key.notes).toContain('target="_blank"');
  });

  it("parses items from a table-progress-tracking table with a leading checkbox column", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-checkbox-items.json"));
    expect(items).toHaveLength(2);

    const tea = items.find((i) => i.kind === "item" && i.wikiUrl?.endsWith("42_Signature_Blend_English_Tea"))!;
    expect(tea).toBeDefined();
    expect(tea).toMatchObject({
      name: "42 Signature Blend English Tea",
      iconUrl:
        "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/e/e6/EnglishTeaIcon.png/revision/latest?cb=20250110174041",
      amount: 1,
      requirement: "Handover item",
      findInRaid: true,
    });

    const axe = items.find((i) => i.kind === "item" && i.wikiUrl?.endsWith("Antique_axe"))!;
    expect(axe).toBeDefined();
    expect(axe).toMatchObject({ name: "Antique axe", amount: 1, findInRaid: true });
  });

  it("keeps name/amount/requirement aligned when a table has no Icon column (generic items with no wiki page of their own)", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-no-icon-column.json"));
    expect(items).toHaveLength(2);

    expect(items[0]).toEqual({
      kind: "item",
      name: "Any food item",
      wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Food",
      iconUrl: null,
      amount: 5,
      requirement: "Handover item",
      findInRaid: true,
      notes: "",
    });
    expect(items[1]).toMatchObject({ kind: "item", name: "Any drink item", amount: 5 });
  });

  it("emits a divider entry for an alternative-items separator row instead of a bogus empty item", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-alternative-items.json"));

    expect(items[0]).toMatchObject({ kind: "item", name: "MS2000 Marker" });
    expect(items[1]).toEqual({ kind: "divider", label: "Flare - You only need one of the below options" });
    expect(items[2]).toMatchObject({ kind: "item", name: "RSP-30 reactive signal cartridge (Yellow)" });
    expect(items[3]).toEqual({ kind: "divider", label: "OR" });
    expect(items[4]).toMatchObject({ kind: "item", name: "ZiD SP-81 26x75 signal pistol" });
    expect(items[5]).toMatchObject({ kind: "item", name: "26x75mm flare cartridge (Yellow)" });
    expect(items).toHaveLength(6);
  });

  it("emits a bare 'OR' divider with no descriptive header row before it", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-or-only-divider.json"));
    expect(items).toEqual([
      expect.objectContaining({ kind: "item", name: "RSP-30 reactive signal cartridge (Red)" }),
      { kind: "divider", label: "OR" },
      expect.objectContaining({ kind: "item", name: "ZiD SP-81 26x75 signal pistol" }),
      expect.objectContaining({ kind: "item", name: "26x75mm flare cartridge (Red)" }),
    ]);
  });

  it("matches the caption case-insensitively ('Related quest items' on some pages)", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-lowercase-caption.json"));
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({ kind: "item", name: "TerraGroup Labs access keycard" });
  });

  it("reads Name/Quantity/Requirements headers, the alternate template used alongside the lowercase caption", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-lowercase-caption.json"));
    expect(items[0]).toMatchObject({
      name: "TerraGroup Labs access keycard",
      amount: 10,
      requirement: "Handover item",
      findInRaid: true,
    });
  });

  it("splits a single row's inline 'A or B or C' alternatives (icon and name cells both list every option) into items separated by an OR divider", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-inline-alternatives-icon-name.json"));
    expect(items).toEqual([
      expect.objectContaining({
        kind: "item",
        name: "Ushanka ear flap hat",
        wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Ushanka_ear_flap_hat",
      }),
      { kind: "divider", label: "OR" },
      expect.objectContaining({ kind: "item", name: "Domontovich ushanka hat" }),
      { kind: "divider", label: "OR" },
      expect.objectContaining({ kind: "item", name: "New Year ushanka hat" }),
      expect.objectContaining({ kind: "item", name: "Scav Vest" }),
      { kind: "divider", label: "OR" },
      expect.objectContaining({ kind: "item", name: "Tac-Kek JayPC plate carrier (Black)" }),
      { kind: "divider", label: "OR" },
      expect.objectContaining({ kind: "item", name: "Tac-Kek JayPC plate carrier (OD Green)" }),
    ]);
    // Every alternative icon resolves to its own item's icon, not just the first one's.
    const icons = new Set(items.filter(isRequiredItem).map((i) => i.iconUrl));
    expect(icons.size).toBeGreaterThan(1);
  });

  it("gives every inline alternative the row's shared amount/requirement/findInRaid", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-inline-alternatives-two.json"));
    const names = items.map((i) => (i.kind === "item" ? i.name : `[${i.label}]`));
    const croutonsIndex = names.indexOf("Rye croutons");
    expect(names.slice(croutonsIndex, croutonsIndex + 3)).toEqual(["Rye croutons", "[OR]", "Emelya rye croutons"]);

    const [croutons, , emelyaCroutons] = items.slice(croutonsIndex);
    expect(croutons).toMatchObject({
      kind: "item",
      name: "Rye croutons",
      amount: 4,
      requirement: "Handover item",
      findInRaid: false,
    });
    expect(emelyaCroutons).toMatchObject({
      kind: "item",
      name: "Emelya rye croutons",
      amount: 4,
      requirement: "Handover item",
      findInRaid: false,
    });
  });

  it("handles a 3-way inline alternative among otherwise ordinary single-item rows", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-inline-alternatives-three.json"));
    const names = items.map((i) => (i.kind === "item" ? i.name : `[${i.label}]`));
    expect(names).toEqual([
      "RB-ORB3 key",
      "RB-OB key",
      "RB-ORB1 key",
      "RB-ORB2 key",
      "FORT Redut-M body armor",
      "[OR]",
      "FORT Defender-2 body armor",
      "[OR]",
      "6B43 Zabralo-Sh body armor (EMR)",
    ]);
  });

  it("carries a rowspan-ed notes cell forward to every row it covers instead of leaving them blank", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-rowspan-notes.json")).filter(isRequiredItem);
    expect(items.map((i) => i.name)).toEqual(["Military documents #1", "Military documents #2", "Military documents #3"]);
    for (const item of items) {
      expect(item.notes).toContain("can only be found if the quest is active");
    }
  });

  it("only carries a rowspan-ed notes cell for as many rows as it covers, not beyond", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-rowspan-notes-mixed.json")).filter(isRequiredItem);
    const [rbKsm, rbSmp, record1, record2] = items;
    expect(rbKsm.notes).toContain("Unlocks room RB-KSM");
    expect(rbSmp.notes).toContain("Unlocks room RB-SMP");
    expect(record1.notes).toContain("can only be found if the");
    expect(record2.notes).toBe(record1.notes);
  });

  it("leaves amount null when the table has no Amount column at all (an item that must be used, not collected)", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-no-amount-column.json"));
    expect(items).toEqual([
      {
        kind: "item",
        name: "Propital regenerative stimulant injector",
        wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Propital_regenerative_stimulant_injector",
        iconUrl:
          "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/1/1b/PropitalIcon.png/revision/latest?cb=20211230205215",
        amount: null,
        requirement: "Required",
        findInRaid: false,
        notes: "Has to be active while making the kills",
      },
    ]);
  });

  it("reads a plain 'Item' header column with no link (item has no wiki page of its own)", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-plain-item-header.json"));
    expect(items).toEqual([
      expect.objectContaining({
        kind: "item",
        name: "Russian armor-piercing ammo pack",
        wikiUrl: null,
        amount: 3,
        requirement: "Required",
        findInRaid: false,
      }),
    ]);
  });

  it("does not split a single generic name into one item per icon when the icon cell shows an illustrative gallery instead of one-per-alternative", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-icon-gallery-generic-name.json")).filter(
      isRequiredItem
    );
    expect(items.map((i) => i.name)).toEqual([
      "Any PMC figurine",
      "Any Scav figurine",
      "Any boss figurine",
      "Any trader figurine",
    ]);
    // A representative icon (the cell's first image) is still shown, just not duplicated per gallery image.
    expect(items[0].iconUrl).toContain("BEAR_operative_figurine_icon");
  });

  it("reads a singular 'Note' header column", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-singular-note-header.json")).filter(
      isRequiredItem
    );
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.name)).toEqual(["Malboro Cigarettes", "Strike Cigarettes", "Wilston cigarettes"]);
    expect(items[2].notes).toContain("Can be crafted in the");
  });
});
