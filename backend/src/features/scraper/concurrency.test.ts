import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("returns results in the same order as the input, regardless of completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never runs more than the given concurrency limit at once", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns an empty array for an empty input", async () => {
    const results = await mapWithConcurrency([] as number[], 4, async (n) => n);
    expect(results).toEqual([]);
  });

  it("passes each item's index to the mapper", async () => {
    const results = await mapWithConcurrency(["a", "b", "c"], 2, async (item, index) => `${item}${index}`);
    expect(results).toEqual(["a0", "b1", "c2"]);
  });
});
