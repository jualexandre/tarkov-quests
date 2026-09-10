import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RequiredItemListComponent } from "./required-item-list.component";
import type { RequiredItemDto } from "../../core/api/quests.api";

describe("RequiredItemListComponent", () => {
  let fixture: ComponentFixture<RequiredItemListComponent>;

  function buildItem(overrides: Partial<RequiredItemDto> = {}): RequiredItemDto {
    return {
      name: "Secure Folder 0060",
      wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
      iconUrl: "/api/item-images/Secure_Folder_0060.png",
      amount: 1,
      requirement: "Handover item",
      findInRaid: true,
      notes: "Quest item.",
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RequiredItemListComponent] });
    fixture = TestBed.createComponent(RequiredItemListComponent);
  });

  it("renders nothing when there are no items", () => {
    fixture.componentInstance.items = [];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe("");
  });

  it("renders the item's icon, name and quantity", () => {
    fixture.componentInstance.items = [buildItem({ amount: 3 })];
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const img = el.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/item-images/Secure_Folder_0060.png");
    expect(img.alt).toBe("Secure Folder 0060");
    expect(el.textContent).toContain("Secure Folder 0060");
    expect(el.textContent).toContain("×3");
  });

  it("does not render an icon when iconUrl is null", () => {
    fixture.componentInstance.items = [buildItem({ iconUrl: null })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector("img")).toBeNull();
  });

  it("shows a hand-over badge when the requirement is a handover item", () => {
    fixture.componentInstance.items = [buildItem({ requirement: "Handover item" })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Hand over");
  });

  it("does not show a hand-over badge when the item is just required", () => {
    fixture.componentInstance.items = [buildItem({ requirement: "Required" })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("Hand over");
  });

  it("shows a find-in-raid badge when findInRaid is true", () => {
    fixture.componentInstance.items = [buildItem({ findInRaid: true })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("FIR");
  });

  it("does not show a find-in-raid badge when findInRaid is false", () => {
    fixture.componentInstance.items = [buildItem({ findInRaid: false })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("FIR");
  });

  it("renders one row per item", () => {
    fixture.componentInstance.items = [buildItem({ name: "Item A" }), buildItem({ name: "Item B" })];
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Item A");
    expect(el.textContent).toContain("Item B");
  });
});
