import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WIKI_BASE_URL } from "../../core/wiki";
import { evaluateRequirements } from "../../core/quest-lock";
import type { QuestCompletionInfo, RequirementsStatus } from "../../core/quest-lock";
import type { QuestRequirementsDto, QuestToggledEvent } from "../../core/api/quests.api";
import { QuestRequirementsComponent } from "../quest-requirements/quest-requirements.component";

export interface QuestCellDto {
  id: number;
  name: string;
  completed: boolean;
  wikiUrl: string;
  requirements: QuestRequirementsDto;
}

@Component({
  selector: "app-quest-cell",
  standalone: true,
  imports: [CommonModule, QuestRequirementsComponent],
  templateUrl: "./quest-cell.component.html",
  host: { class: "contents" },
})
export class QuestCellComponent {
  @Input({ required: true }) quest!: QuestCellDto;
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() toggled = new EventEmitter<QuestToggledEvent>();

  wikiBaseUrl = WIKI_BASE_URL;

  get requirementsStatus(): RequirementsStatus {
    return evaluateRequirements(this.quest.requirements, this.playerLevel, this.completionBySlug);
  }

  get isLocked(): boolean {
    return this.requirementsStatus.locked;
  }

  get lockTooltip(): string {
    const status = this.requirementsStatus;
    const reasons: string[] = [];
    if (status.levelMet === false) {
      reasons.push(`Requires level ${this.quest.requirements.minLevel}`);
    }
    for (const prerequisite of status.prerequisites) {
      if (!prerequisite.completed) {
        reasons.push(`Complete "${prerequisite.name}" first`);
      }
    }
    return reasons.join(", ");
  }

  onToggleCompleted(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggled.emit({ id: this.quest.id, completed: checked });
  }
}
