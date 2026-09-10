import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestDto, TraderDto, QuestToggledEvent } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-table",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, RequiredItemListComponent, QuestListComponent],
  templateUrl: "./quest-table.component.html",
})
export class QuestTableComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedQuests(): QuestDto[] {
    return sortByCompleted(this.trader.quests);
  }
}
