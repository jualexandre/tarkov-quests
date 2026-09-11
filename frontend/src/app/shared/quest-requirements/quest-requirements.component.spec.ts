import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestRequirementsComponent } from "./quest-requirements.component";

describe("QuestRequirementsComponent", () => {
  let fixture: ComponentFixture<QuestRequirementsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestRequirementsComponent] });
    fixture = TestBed.createComponent(QuestRequirementsComponent);
  });

  it("renders nothing when there are no requirements at all", () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.trim()).toBe("");
  });

  it("shows the required level with a checkmark when met", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Level 30 required");
    expect(el.textContent).toContain("✓");
    expect(el.querySelector("span")?.className).toContain("text-[var(--color-available)]");
  });

  it("shows the required level with a lock icon when not met", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", false);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.querySelector("span")?.className).toContain("text-[var(--color-locked)]");
  });

  it("shows the required level with no icon when unknown (player level not entered)", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", null);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("✓");
    expect(el.textContent).not.toContain("🔒");
    expect(el.textContent).toContain("Level 30 required");
  });

  it("lists a completed prerequisite as plain text with a checkmark", () => {
    fixture.componentRef.setInput("prerequisites", [
      { id: 1, traderId: 1, name: "The Punisher - Part 1", completed: true },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const span = el.querySelector("span");
    expect(span?.textContent).toContain("✓");
    expect(span?.textContent).toContain("The Punisher - Part 1");
    expect(el.querySelector("button")).toBeNull();
  });

  it("renders a locked prerequisite as a clickable button with a lock icon", () => {
    fixture.componentRef.setInput("prerequisites", [
      { id: 2, traderId: 3, name: "The Punisher - Part 2", completed: false },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector("button");
    expect(button?.textContent).toContain("🔒");
    expect(button?.textContent).toContain("The Punisher - Part 2");
  });

  it("emits prerequisiteSelected with the quest's id and traderId when its locked button is clicked", () => {
    fixture.componentRef.setInput("prerequisites", [
      { id: 2, traderId: 3, name: "The Punisher - Part 2", completed: false },
    ]);
    fixture.detectChanges();
    const emitted: Array<{ id: number; traderId: number }> = [];
    fixture.componentInstance.prerequisiteSelected.subscribe((v) => emitted.push(v));

    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.click();

    expect(emitted).toEqual([{ id: 2, traderId: 3 }]);
  });

  it("renders loyalty notes as informational text", () => {
    fixture.componentRef.setInput("loyaltyNotes", ["Must reach Loyalty Level 2 with Prapor to obtain this quest."]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Must reach Loyalty Level 2 with Prapor");
  });
});
