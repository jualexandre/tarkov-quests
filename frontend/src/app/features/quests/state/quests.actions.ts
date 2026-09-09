export class LoadTraders {
  static readonly type = "[Quests] Load Traders";
}

export class ToggleQuestCompleted {
  static readonly type = "[Quests] Toggle Quest Completed";
  constructor(public id: number, public completed: boolean) {}
}

export class RunScrape {
  static readonly type = "[Quests] Run Scrape";
}
