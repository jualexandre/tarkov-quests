import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestCellComponent } from "./quest-cell.component";
import type { QuestCompletionInfo } from "../../core/quest-lock";

describe("QuestCellComponent", () => {
  let fixture: ComponentFixture<QuestCellComponent>;

  const noRequirements = { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestCellComponent] });
    fixture = TestBed.createComponent(QuestCellComponent);
    fixture.componentInstance.quest = {
      id: 1,
      name: "Debut",
      completed: false,
      wikiUrl: "/wiki/Debut",
      requirements: noRequirements,
    };
    fixture.detectChanges();
  });

  it("renders the quest name as plain text alongside a 'Show on Wiki' link to the quest's wiki page", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Debut");

    const link = el.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toContain("Show on Wiki");
    expect(link.href).toContain("/wiki/Debut");
  });

  it("shows the name struck through when completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Debut",
      completed: true,
      wikiUrl: "/wiki/Debut",
      requirements: noRequirements,
    });
    fixture.detectChanges();
    const name = (fixture.nativeElement as HTMLElement).querySelector("p") as HTMLElement;
    expect(name.className).toContain("line-through");
  });

  it("emits toggled with the new completed value when the checkbox changes", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector("input[type=checkbox]") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([{ id: 1, completed: true }]);
  });

  it("does not show a lock badge when there are no requirements, and shows the name in gold since the quest is available", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
    const name = el.querySelector("p") as HTMLElement;
    expect(name.className).toContain("text-[var(--color-accent)]");
    expect(name.className).not.toContain("text-[var(--color-text-muted)]");
  });

  it("shows a 'Locked' badge, a red left border, and grays out the name when the player's level is below the required level", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Fertilizers",
      completed: false,
      wikiUrl: "/wiki/Fertilizers",
      requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
    });
    fixture.componentRef.setInput("playerLevel", 20);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.textContent).toContain("Locked");
    const name = el.querySelector("p") as HTMLElement;
    expect(name.className).toContain("text-[var(--color-text-muted)]");
    expect(name.className).not.toContain("text-[var(--color-accent)]");
    const wrapper = el.querySelector("div.flex.items-start") as HTMLElement;
    expect(wrapper.className).toContain("border-red-400/60");
  });

  it("does not lock by level when the player level has not been entered, and the name stays gold", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Fertilizers",
      completed: false,
      wikiUrl: "/wiki/Fertilizers",
      requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
    });
    fixture.componentRef.setInput("playerLevel", null);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
    const name = el.querySelector("p") as HTMLElement;
    expect(name.className).toContain("text-[var(--color-accent)]");
  });

  it("does not show the locked badge or border on a completed quest even if its requirements aren't met", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Fertilizers",
      completed: true,
      wikiUrl: "/wiki/Fertilizers",
      requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
    });
    fixture.componentRef.setInput("playerLevel", 20);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const name = el.querySelector("p") as HTMLElement;
    expect(name.textContent).not.toContain("🔒");
    expect(name.className).toContain("line-through");
    expect(name.className).toContain("text-[var(--color-text-muted)]");
    const wrapper = el.querySelector("div.flex.items-start") as HTMLElement;
    expect(wrapper.className).not.toContain("border-red-400/60");
  });

  it("shows a lock icon when a prerequisite quest is known and not completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 3,
      name: "The Punisher - Part 3",
      completed: false,
      wikiUrl: "/wiki/The_Punisher_-_Part_3",
      requirements: { minLevel: null, prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"], loyaltyNotes: [] },
    });
    const completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map([
      ["The_Punisher_-_Part_2", { name: "The Punisher - Part 2", completed: false }],
    ]);
    fixture.componentRef.setInput("completionBySlug", completionBySlug);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.textContent).toContain("The Punisher - Part 2");
  });

  it("does not lock when the known prerequisite quest is completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 3,
      name: "The Punisher - Part 3",
      completed: false,
      wikiUrl: "/wiki/The_Punisher_-_Part_3",
      requirements: { minLevel: null, prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"], loyaltyNotes: [] },
    });
    const completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map([
      ["The_Punisher_-_Part_2", { name: "The Punisher - Part 2", completed: true }],
    ]);
    fixture.componentRef.setInput("completionBySlug", completionBySlug);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
  });

  it("renders loyalty notes as plain informational text without locking the quest", () => {
    fixture.componentRef.setInput("quest", {
      id: 4,
      name: "Setup",
      completed: false,
      wikiUrl: "/wiki/Setup",
      requirements: {
        minLevel: null,
        prerequisiteQuestSlugs: [],
        loyaltyNotes: ["Must reach Loyalty Level 2 with Skier to obtain this quest."],
      },
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Must reach Loyalty Level 2 with Skier");
    expect(el.textContent).not.toContain("🔒");
  });
});
