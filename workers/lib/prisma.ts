import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var workerPrisma: PrismaClient | undefined;
}

export const prisma = global.workerPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.workerPrisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
