import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { jobHealth, recordJobFailure, recordJobSuccess } from "@/lib/jobs";

const NAME = "test-job";
const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));

describe("job health (cron monitoring)", () => {
  beforeEach(async () => {
    await prisma.jobRun.deleteMany({ where: { name: NAME } });
  });

  it("is unhealthy before the first successful run", async () => {
    const h = await jobHealth(NAME, 15, t(0));
    expect(h.ok).toBe(false);
    expect(h.reason).toBe("never succeeded");
  });

  it("is healthy right after a success", async () => {
    await recordJobSuccess(NAME, t(0));
    expect((await jobHealth(NAME, 15, t(10))).ok).toBe(true);
  });

  it("goes stale when no run succeeds within the window", async () => {
    await recordJobSuccess(NAME, t(0));
    const h = await jobHealth(NAME, 15, t(16));
    expect(h.ok).toBe(false);
    expect(h.reason).toMatch(/no successful run/);
  });

  it("is unhealthy when the latest run failed, and recovers on the next success", async () => {
    await recordJobSuccess(NAME, t(0));
    await recordJobFailure(NAME, new Error("db down"), t(5));
    expect((await jobHealth(NAME, 15, t(6))).reason).toBe("last run failed");
    expect((await prisma.jobRun.findUnique({ where: { name: NAME } }))?.lastError).toBe("db down");
    await recordJobSuccess(NAME, t(10));
    expect((await jobHealth(NAME, 15, t(11))).ok).toBe(true);
  });
});
