import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestItemComponent } from "../quest-item/quest-item.component";
import type { TraderDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-trader-column",
  standalone: true,
  imports: [CommonModule, QuestItemComponent],
  templateUrl: "./trader-column.component.html",
})
export class TraderColumnComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Output() questToggled = new EventEmitter<{ id: number; completed: boolean }>();

  onQuestToggle(id: number, completed: boolean): void {
    this.questToggled.emit({ id, completed });
  }
}
