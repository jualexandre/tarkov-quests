import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { TraderColumnComponent } from "../trader-column/trader-column.component";
import { QuestsState } from "../state/quests.state";
import { LoadTraders, RunScrape, ToggleQuestCompleted } from "../state/quests.actions";
import type { TraderDto, ScrapeSummaryDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-quests-page",
  standalone: true,
  imports: [CommonModule, TraderColumnComponent],
  templateUrl: "./quests-page.component.html",
})
export class QuestsPageComponent implements OnInit {
  private readonly store = inject(Store);

  traders$: Observable<TraderDto[]> = this.store.select(QuestsState.traders);
  loading$: Observable<boolean> = this.store.select(QuestsState.loading);
  lastScrapeSummary$: Observable<ScrapeSummaryDto | null> = this.store.select(QuestsState.lastScrapeSummary);

  ngOnInit(): void {
    this.store.dispatch(new LoadTraders());
  }

  onRunScrape(): void {
    this.store.dispatch(new RunScrape());
  }

  onQuestToggled(event: { id: number; completed: boolean }): void {
    this.store.dispatch(new ToggleQuestCompleted(event.id, event.completed));
  }
}
