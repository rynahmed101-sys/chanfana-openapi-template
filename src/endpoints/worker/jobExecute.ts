import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { WorkerResult } from "../../worker/contracts";
import { runWorkerModel } from "../../worker/model";
import { validateWorkerResultAgainstPacket } from "../../worker/guard";

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
    const claimed = await c.env.DB.prepare(
      "UPDATE worker_jobs SET state = 'running', updated_at = ?1 WHERE id = ?2 AND state = 'queued'"
    ).bind(new Date().toISOString(), params.id).run();

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

      if (errors.length) {
        const now = new Date().toISOString();
        await c.env.DB.prepare(
          "UPDATE worker_jobs SET state = 'failed', result_json = ?1, updated_at = ?2 WHERE id = ?3"
        ).bind(JSON.stringify(result), now, params.id).run();
        return { success: false, state: "failed", result, errors };
      }

      const now = new Date().toISOString();
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET state = 'succeeded', result_json = ?1, updated_at = ?2 WHERE id = ?3"
      ).bind(JSON.stringify(result), now, params.id).run();

      return { success: true, state: "succeeded", result, errors: [] };
    } catch (error) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET state = 'failed', updated_at = ?1 WHERE id = ?2"
      ).bind(now, params.id).run();
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 503);
    }
  }
}
