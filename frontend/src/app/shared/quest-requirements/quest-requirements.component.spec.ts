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
    expect(el.querySelector("span")?.className).toContain("text-green-400");
  });

  it("shows the required level with a lock icon when not met", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", false);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.querySelector("span")?.className).toContain("text-red-400");
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

  it("lists each prerequisite quest with a checkmark or lock icon depending on completion", () => {
    fixture.componentRef.setInput("prerequisites", [
      { name: "The Punisher - Part 1", completed: true },
      { name: "The Punisher - Part 2", completed: false },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const spans = Array.from(el.querySelectorAll("span"));
    expect(spans[0].textContent).toContain("✓");
    expect(spans[0].textContent).toContain("The Punisher - Part 1");
    expect(spans[1].textContent).toContain("🔒");
    expect(spans[1].textContent).toContain("The Punisher - Part 2");
  });

  it("renders loyalty notes as informational text", () => {
    fixture.componentRef.setInput("loyaltyNotes", ["Must reach Loyalty Level 2 with Prapor to obtain this quest."]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Must reach Loyalty Level 2 with Prapor");
  });
});
