// Privileged bootstrap only: authentication, verified webhook routing, cron enumeration.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const systemDatabase = globalForPrisma.prisma ?? new PrismaClient({ transactionOptions: { maxWait: 10000, timeout: 20000 } });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = systemDatabase;
}
