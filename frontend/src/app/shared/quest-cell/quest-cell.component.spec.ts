import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestCellComponent } from "./quest-cell.component";

describe("QuestCellComponent", () => {
  let fixture: ComponentFixture<QuestCellComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestCellComponent] });
    fixture = TestBed.createComponent(QuestCellComponent);
    fixture.componentInstance.quest = { id: 1, name: "Debut", completed: false, wikiUrl: "/wiki/Debut" };
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
    fixture.componentRef.setInput("quest", { id: 1, name: "Debut", completed: true, wikiUrl: "/wiki/Debut" });
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
});
