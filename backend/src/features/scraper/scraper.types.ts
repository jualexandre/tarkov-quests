export interface ParsedQuest {
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
}

export interface ParsedTrader {
  name: string;
  tabOrder: number;
  quests: ParsedQuest[];
}

export interface ScrapeSummary {
  added: number;
  updated: number;
  deactivated: number;
  totalQuests: number;
}

export interface ScraperService {
  runScrape(): Promise<ScrapeSummary>;
}
