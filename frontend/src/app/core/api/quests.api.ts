import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { Observable } from "rxjs";

export interface RequiredItemDto {
  kind: "item";
  name: string;
  wikiUrl: string | null;
  iconUrl: string | null;
  amount: number | null;
  requirement: string;
  findInRaid: boolean;
  notes: string;
}

export interface RequiredItemDividerDto {
  kind: "divider";
  label: string;
}

export type RequiredItemEntryDto = RequiredItemDto | RequiredItemDividerDto;

export interface QuestRequirementsDto {
  minLevel: number | null;
  prerequisiteQuestSlugs: string[];
  loyaltyNotes: string[];
}

export interface QuestDto {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemEntryDto[];
  requirements: QuestRequirementsDto;
  completed: boolean;
  active: boolean;
  lastSeenAt: string;
}

export interface TraderDto {
  id: number;
  name: string;
  slug: string;
  tabOrder: number;
  imageUrl: string | null;
  quests: QuestDto[];
}

export interface ScrapeSummaryDto {
  added: number;
  updated: number;
  deactivated: number;
  totalQuests: number;
  detailFetchFailures: number;
}

export interface QuestToggledEvent {
  id: number;
  completed: boolean;
}

@Injectable({ providedIn: "root" })
export class QuestsApi {
  constructor(private readonly http: HttpClient) {}

  getTraders(): Observable<TraderDto[]> {
    return this.http.get<TraderDto[]>("/api/traders");
  }

  updateQuestCompleted(id: number, completed: boolean): Observable<QuestDto> {
    return this.http.patch<QuestDto>(`/api/quests/${id}`, { completed });
  }

  runScrape(): Observable<ScrapeSummaryDto> {
    return this.http.post<ScrapeSummaryDto>("/api/scrape", {});
  }
}
