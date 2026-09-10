import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WIKI_BASE_URL } from "../../core/wiki";
import type { QuestToggledEvent } from "../../core/api/quests.api";

export interface QuestCellDto {
  id: number;
  name: string;
  completed: boolean;
  wikiUrl: string;
}

@Component({
  selector: "app-quest-cell",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-cell.component.html",
  host: { class: "contents" },
})
export class QuestCellComponent {
  @Input({ required: true }) quest!: QuestCellDto;
  @Output() toggled = new EventEmitter<QuestToggledEvent>();

  wikiBaseUrl = WIKI_BASE_URL;

  onToggleCompleted(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggled.emit({ id: this.quest.id, completed: checked });
  }
}
