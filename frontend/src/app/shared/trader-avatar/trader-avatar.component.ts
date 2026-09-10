import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

export type TraderAvatarSize = "sm" | "md";

@Component({
  selector: "app-trader-avatar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./trader-avatar.component.html",
  host: { class: "contents" },
})
export class TraderAvatarComponent {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) imageUrl!: string | null;
  @Input() size: TraderAvatarSize = "sm";

  get sizeClasses(): string {
    return this.size === "md" ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs";
  }
}
