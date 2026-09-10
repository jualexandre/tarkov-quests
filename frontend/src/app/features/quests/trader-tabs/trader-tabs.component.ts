import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { TraderDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-trader-tabs",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./trader-tabs.component.html",
})
export class TraderTabsComponent {
  @Input({ required: true }) traders!: TraderDto[];
  @Input() selectedTraderId: number | null = null;
  @Output() traderSelected = new EventEmitter<number>();

  onSelect(id: number): void {
    this.traderSelected.emit(id);
  }
}
