import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { WorkerResult } from "../../worker/contracts";
import { runWorkerModel } from "../../worker/model";
import { validateWorkerResultAgainstPacket } from "../../worker/guard";
import { stateForWorkerResult } from "../../worker/state";

export class WorkerJobExecute extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Run one bounded AI worker attempt against a queued packet",
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      "200": {
        description: "Worker attempt completed",
        ...contentJson(z.object({
          success: z.boolean(),
          state: z.string(),
          result: WorkerResult.nullable(),
          errors: z.array(z.string()),
        })),
      },
      "401": { description: "Unauthorized" },
      "404": { description: "Job not found" },
      "409": { description: "Job is not queued" },
      "503": { description: "AI runtime unavailable" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const startedAt = new Date();
    const claimed = await c.env.DB.prepare(
      "UPDATE worker_jobs SET state = 'running', started_at = ?1, heartbeat_at = ?1, finished_at = NULL, deadline_at = datetime(?1, '+' || CAST(COALESCE(estimated_duration_ms, 300000) / 1000 AS INTEGER) || ' seconds'), attempt = attempt + 1, last_error = NULL, updated_at = ?1 WHERE id = ?2 AND state = 'queued'"
    ).bind(startedAt.toISOString(), params.id).run();

    if (!claimed.success || (claimed.meta.changes ?? 0) !== 1) {
      const row = await c.env.DB.prepare("SELECT state FROM worker_jobs WHERE id = ?1")
        .bind(params.id)
        .first<{ state: string }>();

      if (!row) return c.json({ success: false, error: "Job not found" }, 404);
      return c.json({ success: false, error: "Job is not queued" }, 409);
    }

    const row = await c.env.DB.prepare("SELECT packet_json FROM worker_jobs WHERE id = ?1")
      .bind(params.id)
      .first<{ packet_json: string }>();

    if (!row) return c.json({ success: false, error: "Job vanished after claim" }, 404);

    try {
      const stored = JSON.parse(row.packet_json);
      const packet = stored.packet;
      const result = await runWorkerModel(c.env, packet);
      const errors = validateWorkerResultAgainstPacket(packet, result);
      const nextState = stateForWorkerResult(result);

      if (errors.length || nextState === "failed") {
        const now = new Date().toISOString();
        const updated = await c.env.DB.prepare(
          "UPDATE worker_jobs SET state = 'failed', result_json = ?1, finished_at = ?2, heartbeat_at = ?2, updated_at = ?2 WHERE id = ?3 AND state = 'running'"
        ).bind(JSON.stringify(result), now, params.id).run();
        if (!updated.success || (updated.meta.changes ?? 0) !== 1) {
          return c.json({ success: false, error: "Worker result lost a concurrent state transition" }, 409);
        }
        return { success: false, state: "failed", result, errors };
      }

      const now = new Date().toISOString();
      const updated = await c.env.DB.prepare(
        "UPDATE worker_jobs SET state = ?1, result_json = ?2, finished_at = ?3, heartbeat_at = ?3, updated_at = ?3 WHERE id = ?4 AND state = 'running'"
      ).bind(nextState, JSON.stringify(result), now, params.id).run();

      if (!updated.success || (updated.meta.changes ?? 0) !== 1) {
        return c.json({ success: false, error: "Worker result lost a concurrent state transition" }, 409);
      }

      return {
        success: nextState === "succeeded",
        state: nextState,
        result,
        errors,
      };
    } catch (error) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET state = 'failed', finished_at = ?1, heartbeat_at = ?1, last_error = ?2, updated_at = ?1 WHERE id = ?3"
      ).bind(now, params.id).run();
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date().toISOString();
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET state = 'failed', finished_at = ?1, heartbeat_at = ?1, last_error = ?2, updated_at = ?1 WHERE id = ?3"
      ).bind(failedAt, message, params.id).run();
      return c.json({ success: false, error: message }, 503);
    }
  }
}
