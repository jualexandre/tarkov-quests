// Requirement notes are scraped as free-form, sanitized HTML sentences from
// the wiki's requirements list (see wiki-parser.ts). The wiki only ever uses
// a handful of recurring phrasings, so we recognize those and render a
// compact equivalent; anything that doesn't match is passed through as-is.

const ROMAN_LOYALTY_LEVELS: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

type Shortener = (note: string) => string | null;

const shorteners: Shortener[] = [
  // "Must reach Loyalty Level 3 with <a>Prapor</a> to obtain this quest."
  (note) => {
    const match = note.match(/^Must reach Loyalty Level (\d+) with (.+?) to obtain this quest\.?$/i);
    return match ? `LL${match[1]} ${match[2]}` : null;
  },
  // "Must be Loyalty Level 2 to start this quest." (no trader named)
  (note) => {
    const match = note.match(/^Must be Loyalty Level (\d+) to start this quest\.?$/i);
    return match ? `LL${match[1]}` : null;
  },
  // "Obtain level 4 loyalty with <a>Prapor</a>"
  (note) => {
    const match = note.match(/^Obtain level (\d+) loyalty with (.+?)\.?$/i);
    return match ? `LL${match[1]} ${match[2]}` : null;
  },
  // "Loyalty Level II with Prapor." (roman numeral, no "Must"/"Obtain" prefix)
  (note) => {
    const match = note.match(/^Loyalty Level ([IVXLCDM]+) with (.+?)\.?$/i);
    if (!match) return null;
    const level = ROMAN_LOYALTY_LEVELS[match[1].toUpperCase()];
    return level ? `LL${level} ${match[2]}` : null;
  },
  // "Reach Loyalty Level 4 with A, B, C and D" (multiple traders, no "Must")
  (note) => {
    const match = note.match(/^Reach Loyalty Level (\d+) with (.+)$/i);
    return match ? `LL${match[1]}: ${match[2]}` : null;
  },
  // "This quest is only obtainable by <a>BEAR</a> PMCs."
  (note) => {
    const match = note.match(/^This quest is only obtainable by (.+?) PMCs\.?$/i);
    return match ? `${match[1]} only` : null;
  },
  // "This quest is only available to buyers of the "Edge of Darkness" edition of the game."
  (note) => {
    return /^This quest is only available to buyers of the "Edge of Darkness" edition of the game\.?$/i.test(note)
      ? "EoD Edition only"
      : null;
  },
  // "Must accept <a>Skier</a>'s quest <a>Chemical - Part 4</a> to obtain this quest."
  (note) => {
    const match = note.match(/^Must accept .+?'s quest (.+?) to obtain this quest\.?$/i);
    return match ? `Requires: ${match[1]}` : null;
  },
  // "Unlocks 12-13 hours after completion of <a>Thirsty - Echo</a>"
  (note) => {
    const match = note.match(/^Unlocks (.+?) after completion of (.+)$/i);
    return match ? `+${match[1]} after ${match[2]}` : null;
  },
  // "<a>Scav karma</a> of at least +4"
  (note) => {
    const match = note.match(/^(<a[^>]*>Scav karma<\/a>) of at least \+(\d+)$/i);
    return match ? `${match[1]} ≥ +${match[2]}` : null;
  },
  // "<a>Scav karma</a> of -1" (no "at least" qualifier)
  (note) => {
    const match = note.match(/^(<a[^>]*>Scav karma<\/a>) of (-?\d+)$/i);
    return match ? `${match[1]}: ${match[2]}` : null;
  },
  // "Complete the quests:\n<ul>...<li><a>...</a></li>...</ul>"
  (note) => {
    const match = note.match(/^Complete the quests:\s*<ul[^>]*>([\s\S]+)<\/ul>$/i);
    if (!match) return null;
    const links = [...match[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((li) => li[1].trim());
    return links.length > 0 ? `Complete: ${links.join(", ")}` : null;
  },
];

export function shortenLoyaltyNotes(notes: string[]): string[] {
  return notes.map((note) => {
    for (const shorten of shorteners) {
      const result = shorten(note);
      if (result !== null) return result;
    }
    return note;
  });
}
