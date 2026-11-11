import { prisma } from "@/lib/db";

export async function recordJobSuccess(name: string, at = new Date()) {
  await prisma.jobRun.upsert({
    where: { name },
    create: { name, lastSuccessAt: at },
    update: { lastSuccessAt: at },
  });
}

export async function recordJobFailure(name: string, error: unknown, at = new Date()) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  await prisma.jobRun.upsert({
    where: { name },
    create: { name, lastErrorAt: at, lastError: message },
    update: { lastErrorAt: at, lastError: message },
  });
}

export type JobHealth = { ok: boolean; lastSuccessAt: Date | null; lastErrorAt: Date | null; reason?: string };

/** A job is unhealthy if it has never succeeded, its last success is older than `staleMinutes`, or it failed since. */
export async function jobHealth(name: string, staleMinutes: number, now = new Date()): Promise<JobHealth> {
  const run = await prisma.jobRun.findUnique({ where: { name } });
  const lastSuccessAt = run?.lastSuccessAt ?? null;
  const lastErrorAt = run?.lastErrorAt ?? null;
  if (!lastSuccessAt) return { ok: false, lastSuccessAt, lastErrorAt, reason: "never succeeded" };
  if (now.getTime() - lastSuccessAt.getTime() > staleMinutes * 60_000)
    return { ok: false, lastSuccessAt, lastErrorAt, reason: `no successful run in ${staleMinutes} min` };
  if (lastErrorAt && lastErrorAt > lastSuccessAt) return { ok: false, lastSuccessAt, lastErrorAt, reason: "last run failed" };
  return { ok: true, lastSuccessAt, lastErrorAt };
}
