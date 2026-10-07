import { z } from "zod";

/**
 * Verification jobs are durable workflow messages owned semantically by
 * Automate's Verification & Reconciliation Engine. Chanfana only transports,
 * bounds, leases, retries and persists the untrusted result.
 */
export const VerificationJobEnvelope = z.object({
  schema_version: z.literal("automate.verification_job.v1"),
  request_id: z.string().regex(/^ver_[0-9a-f]{32}$/),
  action_cycle_id: z.string().min(8).max(128),
  workflow_kind: z.enum([
    "inventory",
    "reconciliation",
    "diagnosis",
    "repair",
    "mathematical_check",
    "computational_check",
    "ci_wait",
    "security_check",
    "mirror_verification",
    "evidence_assembly",
  ]),
  capability_id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/),
  source_revision: z.string().regex(/^[0-9a-f]{40}$/),
  source_repository: z.string().min(1).max(200),
  source_branch: z.string().min(1).max(255).refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), "source branch contains unsafe path segments"),
  verifier_endpoint: z.string().url(),
  limits: z.object({
    deadline_ms: z.number().int().min(1_000).max(900_000),
    max_response_bytes: z.number().int().min(65_536).max(1_500_000),
  }),
  payload: z.record(z.string(), z.unknown()),
  provenance: z.object({
    parent_ids: z.array(z.string().min(1).max(128)).max(100),
    requested_by: z.literal("automate"),
  }),
});
export type VerificationJobEnvelopeType = z.infer<typeof VerificationJobEnvelope>;

export function validateVerificationJobEnvelope(input: unknown): VerificationJobEnvelopeType {
  const parsed = VerificationJobEnvelope.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid verification job envelope: " + parsed.error.message);
  }
  return parsed.data;
}
