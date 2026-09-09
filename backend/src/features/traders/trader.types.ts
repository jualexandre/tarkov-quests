export interface Trader {
  id: number;
  name: string;
  slug: string;
  tabOrder: number;
}

export interface UpsertTraderInput {
  name: string;
  slug: string;
  tabOrder: number;
}

export interface TraderRepository {
  upsertByName(data: UpsertTraderInput): Promise<Trader>;
  findAll(): Promise<Trader[]>;
}
