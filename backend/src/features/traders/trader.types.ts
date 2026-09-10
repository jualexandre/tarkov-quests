export interface Trader {
  id: number;
  name: string;
  slug: string;
  tabOrder: number;
  imageUrl: string | null;
}

export interface UpsertTraderInput {
  name: string;
  slug: string;
  tabOrder: number;
  imageUrl: string | null;
}

export interface TraderRepository {
  upsertByName(data: UpsertTraderInput): Promise<Trader>;
  findAll(): Promise<Trader[]>;
}
