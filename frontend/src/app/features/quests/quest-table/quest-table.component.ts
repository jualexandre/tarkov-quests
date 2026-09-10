import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { QuestDto, TraderDto } from "../../../core/api/quests.api";

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

  sortedQuests(): QuestDto[] {
    const incomplete = this.trader.quests.filter((quest) => !quest.completed);
    const completed = this.trader.quests.filter((quest) => quest.completed);
    return [...incomplete, ...completed];
  }

  onToggleCompleted(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.questToggled.emit({ id, completed: checked });
  }
}
