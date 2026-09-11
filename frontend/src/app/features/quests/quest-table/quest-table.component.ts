import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { QuestDto, TraderDto, QuestToggledEvent } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-table",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, QuestListComponent],
  templateUrl: "./quest-table.component.html",
})
export class QuestTableComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedQuests(): QuestDto[] {
    return sortByCompleted(this.trader.quests);
  }
}
