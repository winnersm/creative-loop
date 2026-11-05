// Contadores atómicos para los códigos OF### y C###.
import type { Prisma } from "@/generated/prisma/client"

export async function nextCounter(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  })
  return row.value
}
