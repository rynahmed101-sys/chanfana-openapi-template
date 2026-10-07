import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../../types";
import { WorkerPacket } from "../../worker/contracts";
import { VerificationJobEnvelope } from "../../worker/verificationEnvelope";
import { LearningHandoffEnvelope } from "../../worker/learningEnvelope";
import { ResearchJobEnvelope } from "../../worker/researchEnvelope";
import { durationEstimate } from "../../worker/timing";

export class WorkerJobCreate extends OpenAPIRoute<HandleArgs> {
  public schema = {
    tags: ["Worker"],
    summary: "Queue a bounded Automate worker packet",
    request: { body: contentJson(z.union([WorkerPacket, VerificationJobEnvelope, LearningHandoffEnvelope, ResearchJobEnvelope])) },
    responses: {
      "200": {
        description: "Queued or already queued",
        ...contentJson(z.object({
          success: z.boolean(),
          jobId: z.string(),
          state: z.string(),
          requestId: z.string(),
          estimatedDurationMs: z.number().int().nullable().optional(),
        })),
      },
      "400": { description: "Invalid worker or verification packet" },
      "401": { description: "Unauthorized" },
      "503": { description: "Worker queue unavailable" },
    },
  };

  public async handle(c: HandleArgs[0]) {
    const { body } = await this.getValidatedData<typeof this.schema>();
    const now = new Date().toISOString();
    const envelope = body as any;
    const requestId = "packet" in envelope
      ? envelope.packet.request_id
      : envelope.request_id;
    const capabilityId = "packet" in envelope
      ? envelope.packet.capability.id
      : ("capability_id" in envelope
        ? envelope.capability_id
        : "learning:" + envelope.artifact_type);

    const existing = await c.env.DB.prepare(
      "SELECT id, state, request_id, dispatch_state FROM worker_jobs WHERE request_id = ?1",
    ).bind(requestId).first<{
      id: string; state: string; request_id: string; dispatch_state: string;
    }>();

    if (existing) {
      if (existing.state === "queued" && existing.dispatch_state !== "sent") {
        try {
          await c.env.AUTOMATE_JOB_QUEUE.send({ jobId: existing.id });
          await c.env.DB.prepare(
            "UPDATE worker_jobs SET dispatch_state = 'sent', updated_at = ?1 WHERE id = ?2 AND dispatch_state = 'pending'",
          ).bind(now, existing.id).run();
        } catch (error) {
          return c.json({ success: false, error: "Durable queue publish failed" }, 503);
        }
      }
      return {
        success: true,
        jobId: existing.id,
        state: existing.state,
        requestId: existing.request_id,
      };
    }

    const samples = await c.env.DB.prepare(
      "SELECT started_at, finished_at FROM worker_jobs WHERE capability_id = ?1 AND state = 'succeeded' AND started_at IS NOT NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 9",
    ).bind(capabilityId).all<{ started_at: string; finished_at: string }>();

    const durations = (samples.results ?? [])
      .map((sample) => Date.parse(sample.finished_at) - Date.parse(sample.started_at))
      .filter((value) => Number.isFinite(value) && value > 0);
    const estimatedDurationMs = durationEstimate(durations);
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      "INSERT INTO worker_jobs (id, request_id, capability_id, state, packet_json, result_json, created_at, updated_at, estimated_duration_ms, attempt, dispatch_state) VALUES (?1, ?2, ?3, 'queued', ?4, NULL, ?5, ?5, ?6, 0, 'pending')",
    ).bind(
      id,
      requestId,
      capabilityId,
      JSON.stringify(body),
      now,
      estimatedDurationMs,
    ).run();

    try {
      await c.env.AUTOMATE_JOB_QUEUE.send({ jobId: id });
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET dispatch_state = 'sent', updated_at = ?1 WHERE id = ?2 AND dispatch_state = 'pending'",
      ).bind(new Date().toISOString(), id).run();
    } catch (error) {
      await c.env.DB.prepare(
        "UPDATE worker_jobs SET last_error = ?1, updated_at = ?2 WHERE id = ?3",
      ).bind(error instanceof Error ? error.message : String(error), new Date().toISOString(), id).run();
      return c.json({ success: false, error: "Durable queue publish failed; job remains recoverable" }, 503);
    }

    return {
      success: true,
      jobId: id,
      state: "queued",
      requestId,
      estimatedDurationMs,
    };
  }
}
