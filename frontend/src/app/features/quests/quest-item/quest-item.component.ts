import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { QuestDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-item",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-item.component.html",
})
export class QuestItemComponent {
  @Input({ required: true }) quest!: QuestDto;
  @Output() toggle = new EventEmitter<boolean>();

  wikiBaseUrl = "https://escapefromtarkov.fandom.com";
  expanded = false;

  onToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggle.emit(checked);
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }
}
