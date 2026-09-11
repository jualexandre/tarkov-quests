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
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { TraderDto, ScrapeSummaryDto, QuestToggledEvent } from "../../../core/api/quests.api";
import type { PrerequisiteSelectedEvent } from "../../../shared/quest-requirements/quest-requirements.component";

const QUEST_HIGHLIGHT_DURATION_MS = 1500;

const SELECTED_TRADER_STORAGE_KEY = "tarkov-quests.selectedTraderId";
const PLAYER_LEVEL_STORAGE_KEY = "tarkov-quests.playerLevel";

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

  playerLevel = signal<number | null>(this.readStoredPlayerLevel());

  completionBySlug = computed<ReadonlyMap<string, QuestCompletionInfo>>(() => {
    const map = new Map<string, QuestCompletionInfo>();
    for (const trader of this.traders()) {
      for (const quest of trader.quests) {
        map.set(quest.wikiSlug, {
          id: quest.id,
          traderId: trader.id,
          name: quest.name,
          completed: quest.completed,
        });
      }
    }
    return map;
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

  onPrerequisiteSelected(event: PrerequisiteSelectedEvent): void {
    this.searchQuery.set("");
    this.onTraderSelected(event.traderId);
    // The target quest table only exists in the DOM after the trader switch
    // above has been rendered, so defer the scroll to the next tick.
    setTimeout(() => this.scrollToQuest(event.id));
  }

  private scrollToQuest(id: number): void {
    const element = document.getElementById(`quest-${id}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("quest-highlight");
    setTimeout(() => element.classList.remove("quest-highlight"), QUEST_HIGHLIGHT_DURATION_MS);
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onPlayerLevelInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const level = raw === "" ? NaN : Number(raw);
    if (Number.isNaN(level)) {
      this.playerLevel.set(null);
      localStorage.removeItem(PLAYER_LEVEL_STORAGE_KEY);
      return;
    }
    this.playerLevel.set(level);
    localStorage.setItem(PLAYER_LEVEL_STORAGE_KEY, String(level));
  }

  private readStoredTraderId(): number | null {
    const stored = localStorage.getItem(SELECTED_TRADER_STORAGE_KEY);
    return stored ? Number(stored) : null;
  }

  private readStoredPlayerLevel(): number | null {
    const stored = localStorage.getItem(PLAYER_LEVEL_STORAGE_KEY);
    if (stored === null) return null;
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
