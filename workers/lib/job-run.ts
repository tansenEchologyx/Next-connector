import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type JobName =
  | "run-jobs"
  | "process-orders"
  | "stock-delta"
  | "stock-full-feed"
  | "shipping-status";

export async function startJobRun(jobName: JobName) {
  return prisma.jobRun.create({
    data: { jobName, status: "running" },
  });
}

export async function completeJobRun(
  id: number,
  metadata?: Prisma.InputJsonValue,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: "completed",
      finishedAt: new Date(),
      metadata: metadata ?? undefined,
    },
  });
}

export async function failJobRun(id: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: message,
    },
  });
}
