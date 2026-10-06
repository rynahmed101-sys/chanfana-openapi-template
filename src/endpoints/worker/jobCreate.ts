import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { WorkerPacket } from "../../worker/contracts";

export class WorkerJobCreate extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Queue a bounded Automate worker packet",
    request: {
      body: contentJson(WorkerPacket),
    },
    responses: {
      "200": {
        description: "Queued or already queued",
        ...contentJson(z.object({
          success: z.boolean(),
          jobId: z.string(),
          state: z.string(),
          requestId: z.string(),
        })),
      },
      "400": {
        description: "Invalid worker packet",
      },
      "401": {
        description: "Unauthorized",
      },
      "503": {
        description: "Worker persistence unavailable",
      },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { body } = await this.getValidatedData<typeof this.schema>();
    const now = new Date().toISOString();

    const existing = await c.env.DB
      .prepare("SELECT id, state, request_id FROM worker_jobs WHERE request_id = ?1")
      .bind(body.packet.request_id)
      .first<{ id: string; state: string; request_id: string }>();

    if (existing) {
      return {
        success: true,
        jobId: existing.id,
        state: existing.state,
        requestId: existing.request_id,
      };
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO worker_jobs (id, request_id, capability_id, state, packet_json, result_json, created_at, updated_at) VALUES (?1, ?2, ?3, 'queued', ?4, NULL, ?5, ?5)"
    ).bind(
      id,
      body.packet.request_id,
      body.packet.capability.id,
      JSON.stringify(body),
      now,
    ).run();

    return {
      success: true,
      jobId: id,
      state: "queued",
      requestId: body.packet.request_id,
    };
  }
}
