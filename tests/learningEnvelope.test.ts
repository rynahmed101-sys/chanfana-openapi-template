import { describe, expect, it } from "vitest";
import { validateLearningHandoffEnvelope } from "../src/worker/learningEnvelope";

const valid = {
  schema_version: "automate.learning_handoff.v1",
  authority: "UNTRUSTED_LEARNING_EVIDENCE",
  request_id: "learning_" + "a".repeat(8),
  correlation_id: "cycle-1",
  source_revision: "b".repeat(40),
  artifact_type: "research_proposal",
  artifact: {
    schema_version: "mirror.research_proposal.v1",
    authority: "UNTRUSTED_RESEARCH_PROPOSAL",
    status: "CANDIDATE",
  },
  provenance: {
    source_repo: "rynahmed101-sys/the-mirror",
    source_component: "research",
  },
};

describe("learning handoff envelope", () => {
  it("accepts bounded untrusted learning artifacts", () => {
    expect(validateLearningHandoffEnvelope(valid).artifact_type).toBe("research_proposal");
  });

  it("rejects oversized artifacts", () => {
    expect(() => validateLearningHandoffEnvelope({
      ...valid,
      artifact: { text: "x".repeat(1_500_001) },
    })).toThrow(/1.5MB/);
  });

  it("keeps the transport authority explicitly untrusted", () => {
    expect(() => validateLearningHandoffEnvelope({
      ...valid,
      authority: "CERTIFIED",
    })).toThrow();
  });
});
