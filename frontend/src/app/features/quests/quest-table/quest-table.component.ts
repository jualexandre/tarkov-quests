import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { TraderDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-table",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-table.component.html",
})
export class QuestTableComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Output() questToggled = new EventEmitter<{ id: number; completed: boolean }>();

  wikiBaseUrl = "https://escapefromtarkov.fandom.com";
  private readonly expandedIds = new Set<number>();

  isExpanded(id: number): boolean {
    return this.expandedIds.has(id);
  }

  toggleExpanded(id: number): void {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  onToggleCompleted(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.questToggled.emit({ id, completed: checked });
  }
}
