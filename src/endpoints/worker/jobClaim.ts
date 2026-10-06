import { OpenAPIRoute } from "chanfana";
import { contentJson } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";

export class WorkerJobClaim extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Claim a queued worker job for one bounded execution attempt",
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      "200": {
        description: "Job claimed",
        ...contentJson(z.object({ success: z.boolean(), state: z.string() })),
      },
      "401": { description: "Unauthorized" },
      "404": { description: "Job not found" },
      "409": { description: "Job is not claimable" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const row = await c.env.DB.prepare(
      "SELECT state FROM worker_jobs WHERE id = ?1"
    ).bind(params.id).first<{ state: string }>();

    if (!row) {
      return c.json({ success: false, error: "Job not found" }, 404);
    }

    if (row.state !== "queued") {
      return c.json({ success: false, error: "Job is not queued" }, 409);
    }

    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE worker_jobs SET state = 'running', updated_at = ?1 WHERE id = ?2 AND state = 'queued'"
    ).bind(now, params.id).run();

    if (!result.success || (result.meta.changes ?? 0) !== 1) {
      return c.json({ success: false, error: "Job was claimed by another runner" }, 409);
    }

    return { success: true, state: "running" };
  }
}
