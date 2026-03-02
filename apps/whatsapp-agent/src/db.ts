import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let prisma: PrismaClient | undefined;

export function getPrisma() {
  if (!prisma) {
    prisma =
      globalForPrisma.prisma ??
      new PrismaClient({
        log: ["warn"],
      });
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = prisma;
    }
  }
  return prisma;
}

const shutdown = async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
