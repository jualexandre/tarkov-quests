import { describe, it, expect } from "vitest";
import { sortByCompleted } from "./quest-sort";

describe("sortByCompleted", () => {
  function buildItems(completedIds: number[]): Array<{ id: number; completed: boolean }> {
    return [1, 2, 3, 4, 5].map((id) => ({ id, completed: completedIds.includes(id) }));
  }

  it("keeps items in their original order when none are completed", () => {
    expect(sortByCompleted(buildItems([])).map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("moves a completed item to the end", () => {
    expect(sortByCompleted(buildItems([1])).map((i) => i.id)).toEqual([2, 3, 4, 5, 1]);
  });

  it("appends the next completed item after the previously completed ones", () => {
    expect(sortByCompleted(buildItems([1, 3])).map((i) => i.id)).toEqual([2, 4, 5, 1, 3]);
  });

  it("does not mutate the input array", () => {
    const items = buildItems([1]);
    const original = [...items];
    sortByCompleted(items);
    expect(items).toEqual(original);
  });
});
