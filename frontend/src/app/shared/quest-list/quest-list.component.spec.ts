import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestListComponent } from "./quest-list.component";

describe("QuestListComponent", () => {
  let fixture: ComponentFixture<QuestListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestListComponent] });
    fixture = TestBed.createComponent(QuestListComponent);
  });

  it("renders one bullet item per entry, as HTML", () => {
    fixture.componentInstance.items = ["Eliminate 5 <b>Scavs</b>", "+1200 EXP"];
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].innerHTML).toContain("<b>Scavs</b>");
    expect(items[1].textContent).toContain("+1200 EXP");
  });

  it("renders nothing when there are no items", () => {
    fixture.componentInstance.items = [];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll("li").length).toBe(0);
  });
});
