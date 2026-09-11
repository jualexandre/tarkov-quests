import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { PrerequisiteStatus } from "../../core/quest-lock";

export interface PrerequisiteSelectedEvent {
  id: number;
  traderId: number;
}

@Component({
  selector: "app-quest-requirements",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-requirements.component.html",
  host: { class: "contents" },
})
export class QuestRequirementsComponent {
  @Input() minLevel: number | null = null;
  @Input() levelMet: boolean | null = null;
  @Input() prerequisites: PrerequisiteStatus[] = [];
  @Input() loyaltyNotes: string[] = [];
  @Output() prerequisiteSelected = new EventEmitter<PrerequisiteSelectedEvent>();
}
