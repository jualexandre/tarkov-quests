import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { EMPTY } from "rxjs";
import { tap, switchMap, catchError } from "rxjs/operators";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto, ScrapeSummaryDto } from "../../../core/api/quests.api";
import { LoadTraders, ToggleQuestCompleted, RunScrape } from "./quests.actions";

export interface QuestsStateModel {
  traders: TraderDto[];
  loading: boolean;
  lastScrapeSummary: ScrapeSummaryDto | null;
  error: string | null;
}

@State<QuestsStateModel>({
  name: "quests",
  defaults: { traders: [], loading: false, lastScrapeSummary: null, error: null },
})
@Injectable()
export class QuestsState {
  constructor(private readonly questsApi: QuestsApi) {}

  @Selector()
  static traders(state: QuestsStateModel): TraderDto[] {
    return state.traders;
  }

  @Selector()
  static loading(state: QuestsStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static lastScrapeSummary(state: QuestsStateModel): ScrapeSummaryDto | null {
    return state.lastScrapeSummary;
  }

  @Selector()
  static error(state: QuestsStateModel): string | null {
    return state.error;
  }

  @Action(LoadTraders)
  loadTraders(ctx: StateContext<QuestsStateModel>) {
    ctx.patchState({ loading: true, error: null });
    return this.questsApi.getTraders().pipe(
      tap((traders) => ctx.patchState({ traders, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false, error: err.message ?? "Failed to load traders" });
        return EMPTY;
      })
    );
  }

  @Action(ToggleQuestCompleted)
  toggleQuestCompleted(ctx: StateContext<QuestsStateModel>, action: ToggleQuestCompleted) {
    return this.questsApi.updateQuestCompleted(action.id, action.completed).pipe(
      tap((updatedQuest) => {
        const traders = ctx.getState().traders.map((trader) => ({
          ...trader,
          quests: trader.quests.map((quest) => (quest.id === updatedQuest.id ? updatedQuest : quest)),
        }));
        ctx.patchState({ traders });
      })
    );
  }

  @Action(RunScrape)
  runScrape(ctx: StateContext<QuestsStateModel>) {
    ctx.patchState({ loading: true, error: null });
    return this.questsApi.runScrape().pipe(
      tap((summary) => ctx.patchState({ lastScrapeSummary: summary })),
      switchMap(() => this.questsApi.getTraders()),
      tap((traders) => ctx.patchState({ traders, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false, error: err.message ?? "Failed to run scrape" });
        return EMPTY;
      })
    );
  }
}
