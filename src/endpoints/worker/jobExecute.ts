import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { runClaimedWorkerJob } from "../../worker/jobRunner";

export class WorkerJobExecute extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Start one bounded AI worker attempt without blocking the caller",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      "200": {
        description: "Worker attempt started in the background",
        ...contentJson(z.object({
          success: z.literal(true),
          state: z.literal("running"),
          jobId: z.string(),
        })),
      },
      "401": { description: "Unauthorized" },
      "404": { description: "Job not found" },
      "409": { description: "Job is not queued" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const startedAt = new Date();
    const claim = await c.env.DB.prepare(
      "UPDATE worker_jobs SET state = 'running', started_at = ?1, heartbeat_at = ?1, finished_at = NULL, deadline_at = datetime(?1, '+' || CAST(COALESCE(estimated_duration_ms, 300000) / 1000 AS INTEGER) || ' seconds'), attempt = attempt + 1, last_error = NULL, updated_at = ?1 WHERE id = ?2 AND state = 'queued'",
    ).bind(startedAt.toISOString(), params.id).run();

    if (!claim.success || (claim.meta.changes ?? 0) !== 1) {
      const row = await c.env.DB.prepare("SELECT state FROM worker_jobs WHERE id = ?1")
        .bind(params.id).first<{ state: string }>();
      if (!row) return c.json({ success: false, error: "Job not found" }, 404);
      return c.json({ success: false, error: "Job is not queued" }, 409);
    }

    c.executionCtx.waitUntil(runClaimedWorkerJob(c.env, params.id));
    return { success: true as const, state: "running" as const, jobId: params.id };
  }
}
