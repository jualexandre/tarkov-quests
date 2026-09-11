import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CondenseCurrencyPipe } from "../condense-currency.pipe";

@Component({
  selector: "app-quest-list",
  standalone: true,
  imports: [CommonModule, CondenseCurrencyPipe],
  templateUrl: "./quest-list.component.html",
  host: { class: "contents" },
})
export class QuestListComponent {
  @Input({ required: true }) items!: string[];
  @Input() large = false;
  @Input() condense = false;
}
