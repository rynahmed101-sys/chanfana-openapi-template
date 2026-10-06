import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";

export class WorkerJobExecute extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Request durable execution of a queued worker job",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      "200": {
        description: "Job accepted by durable queue",
        ...contentJson(z.object({
          success: z.literal(true),
          state: z.literal("queued"),
          jobId: z.string(),
        })),
      },
      "401": { description: "Unauthorized" },
      "404": { description: "Job not found" },
      "409": { description: "Job is not queueable" },
      "503": { description: "Worker queue unavailable" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const row = await c.env.DB.prepare(
      "SELECT state, dispatch_state FROM worker_jobs WHERE id = ?1",
    ).bind(params.id).first<{ state: string; dispatch_state: string }>();

    if (!row) return c.json({ success: false, error: "Job not found" }, 404);
    if (row.state !== "queued") return c.json({ success: false, error: "Job is not queueable" }, 409);

    try {
      await c.env.AUTOMATE_JOB_QUEUE.send({ jobId: params.id });
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET dispatch_state = 'sent', updated_at = ?1 WHERE id = ?2",
      ).bind(new Date().toISOString(), params.id).run();
    } catch (error) {
      return c.json({ success: false, error: "Durable queue publish failed" }, 503);
    }

    return { success: true as const, state: "queued" as const, jobId: params.id };
  }
}
