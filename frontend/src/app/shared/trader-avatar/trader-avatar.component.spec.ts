import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TraderAvatarComponent } from "./trader-avatar.component";

describe("TraderAvatarComponent", () => {
  let fixture: ComponentFixture<TraderAvatarComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TraderAvatarComponent] });
    fixture = TestBed.createComponent(TraderAvatarComponent);
  });

  it("renders the trader's portrait image when imageUrl is set", () => {
    fixture.componentInstance.name = "Prapor";
    fixture.componentInstance.imageUrl = "/api/trader-images/prapor.png";
    fixture.detectChanges();
    const img = (fixture.nativeElement as HTMLElement).querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/trader-images/prapor.png");
    expect(img.alt).toBe("Prapor");
  });

  it("renders a fallback initial instead of an image when imageUrl is null", () => {
    fixture.componentInstance.name = "Therapist";
    fixture.componentInstance.imageUrl = null;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent?.trim()).toBe("T");
  });

  it("defaults to a small size", () => {
    fixture.componentInstance.name = "Prapor";
    fixture.componentInstance.imageUrl = null;
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector("span") as HTMLElement;
    expect(badge.className).toContain("h-6");
    expect(badge.className).toContain("w-6");
  });

  it("renders a larger size when size is 'md'", () => {
    fixture.componentInstance.name = "Prapor";
    fixture.componentInstance.imageUrl = null;
    fixture.componentInstance.size = "md";
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector("span") as HTMLElement;
    expect(badge.className).toContain("h-8");
    expect(badge.className).toContain("w-8");
  });
});
