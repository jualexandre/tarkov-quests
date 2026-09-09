import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { tap, switchMap } from "rxjs/operators";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto, ScrapeSummaryDto } from "../../../core/api/quests.api";
import { LoadTraders, ToggleQuestCompleted, RunScrape } from "./quests.actions";

export interface QuestsStateModel {
  traders: TraderDto[];
  loading: boolean;
  lastScrapeSummary: ScrapeSummaryDto | null;
}

@State<QuestsStateModel>({
  name: "quests",
  defaults: { traders: [], loading: false, lastScrapeSummary: null },
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

  @Action(LoadTraders)
  loadTraders(ctx: StateContext<QuestsStateModel>) {
    ctx.patchState({ loading: true });
    return this.questsApi.getTraders().pipe(
      tap((traders) => ctx.patchState({ traders, loading: false }))
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
    ctx.patchState({ loading: true });
    return this.questsApi.runScrape().pipe(
      tap((summary) => ctx.patchState({ lastScrapeSummary: summary })),
      switchMap(() => this.questsApi.getTraders()),
      tap((traders) => ctx.patchState({ traders, loading: false }))
    );
  }
}
