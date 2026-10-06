import { type WorkerResultType } from "./contracts";
import { runWorkerModel } from "./model";
import { validateWorkerResultAgainstPacket } from "./guard";
import { stateForWorkerResult } from "./state";
import { validateResearchJobEnvelope, type ResearchJobEnvelopeType } from "./researchEnvelope";
import { validateVerificationJobEnvelope, type VerificationJobEnvelopeType } from "./verificationEnvelope";
import { validateLearningHandoffEnvelope, type LearningHandoffEnvelopeType } from "./learningEnvelope";

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

    // Verification jobs are durable handoffs to Automate's verifier. Chanfana
    // authenticates, bounds, persists and retries; it never interprets the evidence.
    if (packet?.schema_version === "automate.verification_job.v1") {
      const verification: VerificationJobEnvelopeType = validateVerificationJobEnvelope(packet);
      if (!env.VERIFICATION_ENGINE_JOB_TOKEN || !env.VERIFICATION_ENGINE_ENDPOINT) {
        throw new Error("Verification engine endpoint or authentication is not configured");
      }
      if (verification.verifier_endpoint !== env.VERIFICATION_ENGINE_ENDPOINT) {
        throw new Error("verification endpoint is not allowlisted");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), verification.limits.deadline_ms);
      try {
        const response = await fetch(verification.verifier_endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + env.VERIFICATION_ENGINE_JOB_TOKEN,
          },
          body: JSON.stringify(verification),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("verification engine returned HTTP " + response.status);
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > verification.limits.max_response_bytes) {
          throw new Error("verification engine result exceeds bounded payload size");
        }
        const payload = JSON.parse(text);
        const now = new Date().toISOString();
        const updated = await env.DB.prepare(
          "UPDATE worker_jobs SET state = 'succeeded', result_json = ?1, finished_at = ?2, heartbeat_at = ?2, lease_expires_at = NULL, updated_at = ?2, last_error = NULL WHERE id = ?3 AND state = 'running' AND lease_id = ?4",
        ).bind(JSON.stringify(payload), now, jobId, leaseId).run();
        if (!updated.success || (updated.meta.changes ?? 0) !== 1) throw new Error("verification result lost its execution lease before persistence");
        return;
      } finally {
        clearTimeout(timer);
      }
    }

    // Learning handoffs are durable transport objects. Chanfana stores and
    // returns them but never interprets, verifies, promotes, or certifies the artifact.
    if (packet?.schema_version === "automate.learning_handoff.v1") {
      const handoff: LearningHandoffEnvelopeType = validateLearningHandoffEnvelope(packet);
      const payload = {
        schema_version: "automate.learning_handoff_ack.v1",
        authority: "UNTRUSTED_LEARNING_TRANSPORT_ACK",
        request_id: handoff.request_id,
        correlation_id: handoff.correlation_id,
        artifact_type: handoff.artifact_type,
        artifact: handoff.artifact,
        provenance: handoff.provenance,
        stored_at: new Date().toISOString(),
      };
      const now = new Date().toISOString();
      const updated = await env.DB.prepare(
        "UPDATE worker_jobs SET state = 'succeeded', result_json = ?1, finished_at = ?2, heartbeat_at = ?2, lease_expires_at = NULL, updated_at = ?2, last_error = NULL WHERE id = ?3 AND state = 'running' AND lease_id = ?4",
      ).bind(JSON.stringify(payload), now, jobId, leaseId).run();
      if (!updated.success || (updated.meta.changes ?? 0) !== 1) throw new Error("learning handoff lost its execution lease before persistence");
      return;
    }

    // Research jobs are execution envelopes, not implementation-worker packets.
    // Chanfana provides bounded delivery; Mirror performs the world-facing research.
    if (packet?.schema_version === "mirror.research_job.v1") {
      const research: ResearchJobEnvelopeType = validateResearchJobEnvelope(packet);
      if (!env.MIRROR_RESEARCH_ENDPOINT || !env.MIRROR_RESEARCH_JOB_TOKEN) {
        throw new Error("Mirror research endpoint or authentication is not configured");
      }
      if (research.target.mirror_endpoint !== env.MIRROR_RESEARCH_ENDPOINT) {
        throw new Error("Mirror research endpoint is not allowlisted");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), research.limits.deadline_ms);
      try {
        const response = await fetch(research.target.mirror_endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + env.MIRROR_RESEARCH_JOB_TOKEN,
          },
          body: JSON.stringify({
            query: research.query,
            providers: research.providers,
            limit: research.limits.max_results_per_provider,
            maxResponseBytes: research.limits.max_response_bytes,
            researchIntent: research.research_intent,
            correlationId: research.provenance.correlation_id,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Mirror research endpoint returned HTTP " + response.status);
        const payload = await response.json();
        const now = new Date().toISOString();
        const updated = await env.DB.prepare(
          "UPDATE worker_jobs SET state = 'succeeded', result_json = ?1, finished_at = ?2, heartbeat_at = ?2, lease_expires_at = NULL, updated_at = ?2, last_error = NULL WHERE id = ?3 AND state = 'running' AND lease_id = ?4",
        ).bind(JSON.stringify(payload), now, jobId, leaseId).run();
        if (!updated.success || (updated.meta.changes ?? 0) !== 1) throw new Error("research result lost its execution lease before persistence");
        return;
      } finally {
        clearTimeout(timer);
      }
    }

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
