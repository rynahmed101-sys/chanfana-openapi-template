import { type WorkerResultType } from "./contracts";
import { runWorkerModel } from "./model";
import { validateWorkerResultAgainstPacket } from "./guard";
import { stateForWorkerResult } from "./state";

export async function runClaimedWorkerJob(
  env: Env,
  jobId: string,
  leaseId: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT packet_json FROM worker_jobs WHERE id = ?1 AND state = 'running' AND lease_id = ?2",
  ).bind(jobId, leaseId).first<{ packet_json: string }>();

  if (!row) return;

  try {
    const stored = JSON.parse(row.packet_json);
    const packet = stored.packet;
    const result: WorkerResultType = await runWorkerModel(env, packet);
    const errors = validateWorkerResultAgainstPacket(packet, result);
    const nextState = errors.length ? "failed" : stateForWorkerResult(result);
    const now = new Date().toISOString();

    const updated = await env.DB.prepare(
      "UPDATE worker_jobs SET state = ?1, result_json = ?2, finished_at = ?3, heartbeat_at = ?3, lease_expires_at = NULL, updated_at = ?3, last_error = ?4 WHERE id = ?5 AND state = 'running' AND lease_id = ?6",
    ).bind(
      nextState,
      JSON.stringify(result),
      now,
      errors.length ? errors.join("; ") : null,
      jobId,
      leaseId,
    ).run();

    if (!updated.success || (updated.meta.changes ?? 0) !== 1) {
      throw new Error("worker result lost its execution lease before persistence");
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE worker_jobs SET state = 'failed', finished_at = ?1, heartbeat_at = ?1, lease_expires_at = NULL, last_error = ?2, updated_at = ?1 WHERE id = ?3 AND state = 'running' AND lease_id = ?4",
      ).bind(now, error.message, jobId, leaseId).run();
      return;
    }
    throw error;
  }
}
