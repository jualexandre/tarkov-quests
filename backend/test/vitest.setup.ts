import { afterEach, afterAll } from "vitest";
import { getPrismaClient } from "../src/shared/prisma-client";

const prisma = getPrismaClient();

afterEach(async () => {
  await prisma.quest.deleteMany();
  await prisma.trader.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
