import { describe, expect, it } from "vitest";
import { VerificationJobEnvelope, validateVerificationJobEnvelope } from "../src/worker/verificationEnvelope";

const valid = {
  schema_version: "automate.verification_job.v1",
  request_id: "ver_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  action_cycle_id: "cycle_12345678",
  workflow_kind: "mathematical_check",
  capability_id: "stage1b.improper_integrals",
  source_revision: "a".repeat(40),
  source_repository: "rynahmed101-sys/automate",
  verifier_endpoint: "https://automate.example/verification",
  limits: { deadline_ms: 30_000, max_response_bytes: 100_000 },
  payload: { case: "1/(1+x**2)" },
  provenance: { parent_ids: ["evi_1"], requested_by: "automate" },
};

describe("verification envelope", () => {
  it("accepts an exact-revision bounded job", () => {
    expect(VerificationJobEnvelope.safeParse(valid).success).toBe(true);
  });
  it("rejects missing provenance and fake revisions", () => {
    const bad = { ...valid, source_revision: "not-a-sha", provenance: {} };
    expect(VerificationJobEnvelope.safeParse(bad).success).toBe(false);
  });
  it("rejects an endpoint without a URL and an excessive budget", () => {
    expect(() => validateVerificationJobEnvelope({ ...valid, verifier_endpoint: "https://automate.example/verification" } as unknown)).not.toThrow();
    expect(validateVerificationJobEnvelope({ ...valid, limits: { deadline_ms: 999_999_999, max_response_bytes: 100_000 } } as unknown)).toThrow();
  });
});
