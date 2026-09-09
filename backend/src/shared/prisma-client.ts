import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}
