import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { RequiredItemDto } from "../../core/api/quests.api";

@Component({
  selector: "app-required-item-list",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./required-item-list.component.html",
  host: { class: "contents" },
})
export class RequiredItemListComponent {
  @Input({ required: true }) items!: RequiredItemDto[];

  isHandover(item: RequiredItemDto): boolean {
    return item.requirement.toLowerCase().includes("handover");
  }
}
