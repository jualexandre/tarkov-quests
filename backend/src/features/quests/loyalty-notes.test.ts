import { describe, it, expect } from "vitest";
import { shortenLoyaltyNotes } from "./loyalty-notes";

describe("shortenLoyaltyNotes", () => {
  it('shortens "Must reach Loyalty Level N with TRADER to obtain this quest."', () => {
    const note =
      'Must reach Loyalty Level 3 with <a href="https://escapefromtarkov.fandom.com/wiki/Prapor" title="Prapor" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">Prapor</a> to obtain this quest.';
    expect(shortenLoyaltyNotes([note])).toEqual([
      'LL3 <a href="https://escapefromtarkov.fandom.com/wiki/Prapor" title="Prapor" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">Prapor</a>',
    ]);
  });

  it('shortens "Obtain level N loyalty with TRADER" (no trailing period)', () => {
    const note =
      'Obtain level 4 loyalty with <a href="https://escapefromtarkov.fandom.com/wiki/Prapor" title="Prapor" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">Prapor</a>';
    expect(shortenLoyaltyNotes([note])).toEqual([
      'LL4 <a href="https://escapefromtarkov.fandom.com/wiki/Prapor" title="Prapor" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">Prapor</a>',
    ]);
  });

  it('shortens the roman-numeral "Loyalty Level II with Prapor." variant', () => {
    expect(shortenLoyaltyNotes(["Loyalty Level II with Prapor."])).toEqual(["LL2 Prapor"]);
  });

  it('shortens "Must be Loyalty Level N to start this quest." (no named trader)', () => {
    expect(shortenLoyaltyNotes(["Must be Loyalty Level 2 to start this quest."])).toEqual(["LL2"]);
    expect(shortenLoyaltyNotes(["Must be Loyalty Level 2 to start this quest"])).toEqual(["LL2"]);
  });

  it('shortens the multi-trader "Reach Loyalty Level N with A, B and C" variant', () => {
    const note =
      'Reach Loyalty Level 4 with <a href="https://escapefromtarkov.fandom.com/wiki/Prapor">Prapor</a>, <a href="https://escapefromtarkov.fandom.com/wiki/Therapist">Therapist</a> and <a href="https://escapefromtarkov.fandom.com/wiki/Skier">Skier</a>';
    expect(shortenLoyaltyNotes([note])).toEqual([
      'LL4: <a href="https://escapefromtarkov.fandom.com/wiki/Prapor">Prapor</a>, <a href="https://escapefromtarkov.fandom.com/wiki/Therapist">Therapist</a> and <a href="https://escapefromtarkov.fandom.com/wiki/Skier">Skier</a>',
    ]);
  });

  it('shortens "This quest is only obtainable by FACTION PMCs."', () => {
    const note =
      'This quest is only obtainable by <a href="https://escapefromtarkov.fandom.com/wiki/BEAR" title="BEAR" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">BEAR</a> PMCs.';
    expect(shortenLoyaltyNotes([note])).toEqual([
      '<a href="https://escapefromtarkov.fandom.com/wiki/BEAR" title="BEAR" target="_blank" rel="noopener" class="hover:text-[var(--color-accent)]">BEAR</a> only',
    ]);
  });

  it('shortens the Edge of Darkness edition note', () => {
    expect(
      shortenLoyaltyNotes(['This quest is only available to buyers of the "Edge of Darkness" edition of the game.'])
    ).toEqual(["EoD Edition only"]);
  });

  it('shortens "Must accept TRADER\'s quest QUEST to obtain this quest."', () => {
    const note =
      'Must accept <a href="https://escapefromtarkov.fandom.com/wiki/Skier">Skier</a>\'s quest <a href="https://escapefromtarkov.fandom.com/wiki/Chemical_-_Part_4">Chemical - Part 4</a> to obtain this quest.';
    expect(shortenLoyaltyNotes([note])).toEqual([
      'Requires: <a href="https://escapefromtarkov.fandom.com/wiki/Chemical_-_Part_4">Chemical - Part 4</a>',
    ]);
  });

  it('shortens "Unlocks X after completion of QUEST"', () => {
    const note =
      'Unlocks 12-13 hours after completion of <a href="https://escapefromtarkov.fandom.com/wiki/Thirsty_-_Echo">Thirsty - Echo</a>';
    expect(shortenLoyaltyNotes([note])).toEqual([
      '+12-13 hours after <a href="https://escapefromtarkov.fandom.com/wiki/Thirsty_-_Echo">Thirsty - Echo</a>',
    ]);
  });

  it('shortens "Scav karma of at least +N"', () => {
    const note =
      '<a href="https://escapefromtarkov.fandom.com/wiki/Scavs#Scav_karma">Scav karma</a> of at least +4';
    expect(shortenLoyaltyNotes([note])).toEqual([
      '<a href="https://escapefromtarkov.fandom.com/wiki/Scavs#Scav_karma">Scav karma</a> ≥ +4',
    ]);
  });

  it('shortens "Scav karma of N" (no "at least" qualifier)', () => {
    const note = '<a href="https://escapefromtarkov.fandom.com/wiki/Scavs#Scav_karma">Scav karma</a> of -1';
    expect(shortenLoyaltyNotes([note])).toEqual([
      '<a href="https://escapefromtarkov.fandom.com/wiki/Scavs#Scav_karma">Scav karma</a>: -1',
    ]);
  });

  it('shortens a "Complete the quests:" bullet list into a comma-joined line', () => {
    const note =
      'Complete the quests:\n<ul class="list-disc list-inside space-y-0.5 pl-4 mt-0.5"><li><a href="https://escapefromtarkov.fandom.com/wiki/Chemical_-_Part_3">Chemical - Part 3</a></li>\n<li><a href="https://escapefromtarkov.fandom.com/wiki/Sew_it_Good_-_Part_2">Sew it Good - Part 2</a></li></ul>';
    expect(shortenLoyaltyNotes([note])).toEqual([
      'Complete: <a href="https://escapefromtarkov.fandom.com/wiki/Chemical_-_Part_3">Chemical - Part 3</a>, <a href="https://escapefromtarkov.fandom.com/wiki/Sew_it_Good_-_Part_2">Sew it Good - Part 2</a>',
    ]);
  });

  it("leaves unrecognized notes unchanged", () => {
    expect(shortenLoyaltyNotes(["Must have no Prestige."])).toEqual(["Must have no Prestige."]);
  });

  it("processes each note in the array independently", () => {
    expect(shortenLoyaltyNotes(["Loyalty Level II with Prapor.", "Must have no Prestige."])).toEqual([
      "LL2 Prapor",
      "Must have no Prestige.",
    ]);
  });
});
