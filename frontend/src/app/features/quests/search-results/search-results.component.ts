import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { TraderAvatarComponent } from "../../../shared/trader-avatar/trader-avatar.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { QuestDto, QuestToggledEvent } from "../../../core/api/quests.api";
import type { PrerequisiteSelectedEvent } from "../../../shared/quest-requirements/quest-requirements.component";

export type SearchResultDto = QuestDto & { traderName: string; traderImageUrl: string | null };

@Component({
  selector: "app-search-results",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, QuestListComponent, RequiredItemListComponent, TraderAvatarComponent],
  templateUrl: "./search-results.component.html",
})
export class SearchResultsComponent {
  @Input({ required: true }) results!: SearchResultDto[];
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();
  @Output() prerequisiteSelected = new EventEmitter<PrerequisiteSelectedEvent>();

  sortedResults(): SearchResultDto[] {
    return sortByCompleted(this.results);
  }
}
