import { describe, expect, it } from "vitest";
import { validateResearchJobEnvelope } from "../src/worker/researchEnvelope";

describe("research job envelope", () => {
  it("accepts bounded external research requests", () => {
    const x = validateResearchJobEnvelope({
      schema_version: "mirror.research_job.v1",
      request_id: "req_research_123",
      execution_kind: "external_research",
      target: { mirror_endpoint: "https://example.invalid/research" },
      query: "improper integral convergence",
      providers: ["crossref", "openalex", "arxiv"],
      limits: { max_results_per_provider: 5, deadline_ms: 120000, max_response_bytes: 1500000 },
      research_intent: {
        objective: "collect bounded background evidence",
        summary: "test",
        requirements: ["return provenance"],
        instructions: ["do not certify"],
      },
      provenance: { capability_id: "stage1b.improper_integrals", experiment_id: null, correlation_id: "corr_123" },
    });
    expect(x.execution_kind).toBe("external_research");
  });

  it("rejects unbounded or unknown providers", () => {
    expect(() => validateResearchJobEnvelope({
      schema_version: "mirror.research_job.v1",
      request_id: "req_research_123",
      execution_kind: "external_research",
      target: { mirror_endpoint: "https://example.invalid/research" },
      query: "test",
      providers: ["unknown-provider"],
      limits: { max_results_per_provider: 50, deadline_ms: 1, max_response_bytes: 99999999 },
      provenance: { capability_id: "x", experiment_id: null, correlation_id: "corr_123" },
    })).toThrow();
  });
});
