import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-quest-list",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-list.component.html",
  host: { class: "contents" },
})
export class QuestListComponent {
  @Input({ required: true }) items!: string[];
  @Input() large = false;
}
