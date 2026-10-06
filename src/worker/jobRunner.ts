import { WorkerResult } from "./contracts";
import { runWorkerModel } from "./model";
import { validateWorkerResultAgainstPacket } from "./guard";
import { stateForWorkerResult } from "./state";

export async function runClaimedWorkerJob(env: Env, jobId: string): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT packet_json FROM worker_jobs WHERE id = ?1 AND state = 'running'",
  ).bind(jobId).first<{ packet_json: string }>();

  if (!row) return;

  try {
    const stored = JSON.parse(row.packet_json);
    const packet = stored.packet;
    const result = await runWorkerModel(env, packet);
    const errors = validateWorkerResultAgainstPacket(packet, result);
    const nextState = errors.length ? "failed" : stateForWorkerResult(result);
    const now = new Date().toISOString();

    await env.DB.prepare(
      "UPDATE worker_jobs SET state = ?1, result_json = ?2, finished_at = ?3, heartbeat_at = ?3, updated_at = ?3, last_error = ?4 WHERE id = ?5 AND state = 'running'",
    ).bind(
      nextState,
      JSON.stringify(result),
      now,
      errors.length ? errors.join("; ") : null,
      jobId,
    ).run();
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE worker_jobs SET state = 'failed', finished_at = ?1, heartbeat_at = ?1, last_error = ?2, updated_at = ?1 WHERE id = ?3 AND state = 'running'",
    ).bind(now, message, jobId).run();
  }
}
