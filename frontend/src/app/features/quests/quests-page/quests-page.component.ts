import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { TraderTabsComponent } from "../trader-tabs/trader-tabs.component";
import { QuestTableComponent } from "../quest-table/quest-table.component";
import { SearchResultsComponent, type SearchResultDto } from "../search-results/search-results.component";
import { QuestsState } from "../state/quests.state";
import { LoadTraders, RunScrape, ToggleQuestCompleted } from "../state/quests.actions";
import type { TraderDto, ScrapeSummaryDto, QuestToggledEvent } from "../../../core/api/quests.api";

const SELECTED_TRADER_STORAGE_KEY = "tarkov-quests.selectedTraderId";

@Component({
  selector: "app-quests-page",
  standalone: true,
  imports: [CommonModule, TraderTabsComponent, QuestTableComponent, SearchResultsComponent],
  templateUrl: "./quests-page.component.html",
})
export class QuestsPageComponent implements OnInit {
  private readonly store = inject(Store);

  traders = toSignal(this.store.select(QuestsState.traders), { initialValue: [] as TraderDto[] });
  loading$: Observable<boolean> = this.store.select(QuestsState.loading);
  lastScrapeSummary$: Observable<ScrapeSummaryDto | null> = this.store.select(QuestsState.lastScrapeSummary);
  error$: Observable<string | null> = this.store.select(QuestsState.error);

  private readonly selectedTraderId = signal<number | null>(this.readStoredTraderId());

  selectedTrader = computed<TraderDto | null>(() => {
    const traders = this.traders();
    if (traders.length === 0) return null;
    const id = this.selectedTraderId();
    return traders.find((trader) => trader.id === id) ?? traders[0];
  });

  searchQuery = signal("");

  searchResults = computed<SearchResultDto[] | null>(() => {
    const term = this.searchQuery().trim().toLowerCase();
    if (!term) return null;
    return this.traders().flatMap((trader) =>
      trader.quests
        .filter((quest) => quest.name.toLowerCase().includes(term))
        .map((quest) => ({ ...quest, traderName: trader.name, traderImageUrl: trader.imageUrl }))
    );
  });

  ngOnInit(): void {
    this.store.dispatch(new LoadTraders());
  }

  onRunScrape(): void {
    this.store.dispatch(new RunScrape());
  }

  onQuestToggled(event: QuestToggledEvent): void {
    this.store.dispatch(new ToggleQuestCompleted(event.id, event.completed));
  }

  onTraderSelected(id: number): void {
    this.selectedTraderId.set(id);
    localStorage.setItem(SELECTED_TRADER_STORAGE_KEY, String(id));
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  private readStoredTraderId(): number | null {
    const stored = localStorage.getItem(SELECTED_TRADER_STORAGE_KEY);
    return stored ? Number(stored) : null;
  }
}
