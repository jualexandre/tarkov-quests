import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestItemComponent } from "./quest-item.component";
import type { QuestDto } from "../../../core/api/quests.api";

describe("QuestItemComponent", () => {
  let fixture: ComponentFixture<QuestItemComponent>;

  const quest: QuestDto = {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: ["Eliminate 5 Scavs"],
    rewards: ["+1200 EXP"],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestItemComponent] });
    fixture = TestBed.createComponent(QuestItemComponent);
    fixture.componentInstance.quest = quest;
    fixture.detectChanges();
  });

  it("renders the quest name and a wiki link", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Debut");
    const link = el.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toContain("/wiki/Debut");
  });

  it("emits toggle with the new value when the checkbox is clicked", () => {
    const emitted: boolean[] = [];
    fixture.componentInstance.toggle.subscribe((v: boolean) => emitted.push(v));

    const checkbox = fixture.nativeElement.querySelector("input[type=checkbox]") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([true]);
  });

  it("renders duplicate objective strings without throwing", () => {
    const duplicateQuest: QuestDto = {
      ...quest,
      objectives: ["Hand over the item", "Hand over the item"],
    };
    fixture.componentInstance.quest = duplicateQuest;
    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.dispatchEvent(new Event("click"));

    expect(() => fixture.detectChanges()).not.toThrow();

    const el: HTMLElement = fixture.nativeElement;
    const objectiveItems = el.querySelectorAll("ul.list-disc")[0].querySelectorAll("li");
    expect(objectiveItems.length).toBe(2);
  });
});
