import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { timingSnapshot, type JobTimingRow } from "../../worker/timing";

const Timing = z.object({
  startedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  estimatedDurationMs: z.number().int().nullable(),
  elapsedMs: z.number().int(),
  remainingMs: z.number().int().nullable(),
  etaAt: z.string().nullable(),
  overdue: z.boolean(),
  attempt: z.number().int(),
});

const Job = z.object({
  id: z.string(),
  requestId: z.string(),
  capabilityId: z.string(),
  state: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  hasResult: z.boolean(),
  timing: Timing,
});

export class WorkerJobRead extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Inspect an autonomous worker job with wall-clock ETA",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      "200": { description: "Job found", ...contentJson(z.object({ success: z.literal(true), job: Job })) },
      "401": { description: "Unauthorized" },
      "404": { description: "Job not found" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const row = await c.env.DB.prepare(
      "SELECT id, request_id, capability_id, state, created_at, updated_at, result_json, started_at, heartbeat_at, finished_at, deadline_at, estimated_duration_ms, attempt FROM worker_jobs WHERE id = ?1"
    ).bind(params.id).first<JobTimingRow & {
      id: string; request_id: string; capability_id: string;
      created_at: string; updated_at: string; result_json: string | null;
    }>();

    if (!row) return c.json({ success: false, error: "Job not found" }, 404);

    return {
      success: true as const,
      job: {
        id: row.id,
        requestId: row.request_id,
        capabilityId: row.capability_id,
        state: row.state,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        hasResult: row.result_json !== null,
        timing: timingSnapshot(row),
      },
    };
  }
}
