import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TraderTabsComponent } from "./trader-tabs.component";
import type { TraderDto } from "../../../core/api/quests.api";

describe("TraderTabsComponent", () => {
  let fixture: ComponentFixture<TraderTabsComponent>;

  const traders: TraderDto[] = [
    { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, imageUrl: "/api/trader-images/prapor.png", quests: [] },
    { id: 2, name: "Therapist", slug: "therapist", tabOrder: 1, imageUrl: null, quests: [] },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TraderTabsComponent] });
    fixture = TestBed.createComponent(TraderTabsComponent);
    fixture.componentInstance.traders = traders;
    fixture.componentInstance.selectedTraderId = 1;
    fixture.detectChanges();
  });

  it("renders one tab button per trader with its name", () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain("Prapor");
    expect(buttons[1].textContent).toContain("Therapist");
  });

  it("renders the trader's portrait image when imageUrl is set", () => {
    const el: HTMLElement = fixture.nativeElement;
    const img = el.querySelectorAll("button")[0].querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/trader-images/prapor.png");
  });

  it("renders a fallback initial instead of an image when imageUrl is null", () => {
    const el: HTMLElement = fixture.nativeElement;
    const therapistButton = el.querySelectorAll("button")[1];
    expect(therapistButton.querySelector("img")).toBeNull();
    expect(therapistButton.textContent).toContain("T");
  });

  it("marks the selected trader's button distinctly from the others", () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll("button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("emits traderSelected with the trader's id when a tab is clicked", () => {
    const emitted: number[] = [];
    fixture.componentInstance.traderSelected.subscribe((id: number) => emitted.push(id));

    const el: HTMLElement = fixture.nativeElement;
    (el.querySelectorAll("button")[1] as HTMLButtonElement).click();

    expect(emitted).toEqual([2]);
  });
});
