import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const secret = "test-worker-secret";

function packet(requestId = "wrk_test_12345678") {
  return {
    schema_version: "automate.worker.v1",
    packet: {
      kind: "capability_implementation",
      request_id: requestId,
      repository: {
        full_name: "rynahmed101-sys/automate",
        base_branch: "main",
        base_sha_claim: null,
      },
      capability: {
        id: "stage1b.improper_integrals",
        stage: "1B",
        name: "Improper integrals and convergence-aware handling",
        dependencies: ["stage1b.calculus"],
      },
      constraints: {
        allowed_path_prefixes: ["automate/backend", "tests", "docs"],
        forbidden_paths: [
          "docs/PROJECT_PHASE_LEDGER.md",
          "docs/CAPABILITY_INVENTORY.json",
        ],
        branch_prefix: "feat/",
        max_files: 20,
        allow_delete: false,
      },
      instructions: ["Implement only the assigned capability."],
      verification: {
        must_run_tests: true,
        must_report_unresolved: true,
        must_not_claim_certification: true,
        test_targets: ["tests/test_improper_integrals.py"],
      },
    },
  };
}

describe("Automate worker API", () => {
  it("exposes public health", async () => {
    const response = await SELF.fetch("http://local.test/worker/v1/health");
    const body = await response.json<{ success: boolean; protocol: string }>();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.protocol).toBe("automate.worker.v1");
  });

  it("requires authentication for job submission", async () => {
    const response = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet()),
    });
    expect(response.status).toBe(401);
  });

  it("queues idempotently and supports claim", async () => {
    const body = packet("wrk_test_claim_20261007_001");
    const first = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify(body),
    });
    const firstJson = await first.json<{ jobId: string; state: string }>();
    expect(first.status).toBe(200);
    expect(firstJson.state).toBe("queued");

    const second = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify(body),
    });
    const secondJson = await second.json<{ jobId: string; state: string }>();
    expect(second.status).toBe(200);
    expect(secondJson.jobId).toBe(firstJson.jobId);

    const claim = await SELF.fetch("http://local.test/worker/v1/jobs/" + firstJson.jobId + "/claim", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret },
    });
    expect(claim.status).toBe(200);
    expect((await claim.json<{ state: string }>()).state).toBe("queued");
  });

  it("rejects a result outside the packet boundary", async () => {
    const body = packet("wrk_test_87654321");
    const create = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify(body),
    });
    const job = await create.json<{ jobId: string }>();

    const claim = await SELF.fetch("http://local.test/worker/v1/jobs/" + job.jobId + "/claim", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret },
    });
    expect(claim.status).toBe(200);

    await env.DB.prepare(
      "UPDATE worker_jobs SET state = 'running', lease_id = 'test-lease', lease_expires_at = ?1 WHERE id = ?2",
    ).bind(new Date(Date.now() + 60_000).toISOString(), job.jobId).run();

    const result = await SELF.fetch("http://local.test/worker/v1/jobs/" + job.jobId + "/result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify({
        schema_version: "automate.worker_result.v1",
        request_id: "wrk_test_87654321",
        status: "proposed",
        changes: [
          { operation: "update", path: "automate/dev/inventory.py", expected_sha: "0000000000000000000000000000000000000000", content: "forbidden" },
        ],
        tests: [],
        unresolved: ["not run"],
      }),
    });

    expect(result.status).toBe(200);
    const resultBody = await result.json<{ success: boolean; errors: string[] }>();
    expect(resultBody.success).toBe(false);
    expect(resultBody.errors.some((error) => error.includes("outside allowed capability paths"))).toBe(true);
  });

  it("reads a completed result payload when requested", async () => {
    const body = packet("wrk_test_resultread1");
    const create = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(body),
    });
    const job = await create.json<{ jobId: string }>();
    await env.DB.prepare(
      "UPDATE worker_jobs SET state = 'succeeded', result_json = ?1, attempt = 2 WHERE id = ?2",
    ).bind(JSON.stringify({ schema_version: "automate.verification_result.v1", status: "UNRESOLVED" }), job.jobId).run();
    const read = await SELF.fetch("http://local.test/worker/v1/jobs/" + job.jobId + "?includeResult=true", {
      headers: { Authorization: "Bearer " + secret },
    });
    expect(read.status).toBe(200);
    const payload = await read.json<any>();
    expect(payload.job.result.status).toBe("UNRESOLVED");
    expect(payload.job.resultId).toMatch(/^res_[0-9a-f]{64}$/);
  });

  it("deduplicates verification envelopes by deterministic request id", async () => {
    const verification = {
      schema_version: "automate.verification_job.v1",
      request_id: "ver_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      action_cycle_id: "cycle_12345678",
      workflow_kind: "mathematical_check",
      capability_id: "stage1b.improper_integrals",
      source_revision: "a".repeat(40),
      source_repository: "rynahmed101-sys/automate",
      source_branch: "feat/stage1b.improper_integrals-" + "b".repeat(12),
      verifier_endpoint: "https://automate.example/verification",
      limits: { deadline_ms: 30_000, max_response_bytes: 100_000 },
      payload: { case: "1/(1+x**2)" },
      provenance: { parent_ids: [], requested_by: "automate" },
    };
    const first = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(verification),
    });
    const a = await first.json<any>();
    const second = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(verification),
    });
    const b = await second.json<any>();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(b.jobId).toBe(a.jobId);
  });

  it("rejects a result submitted before the job is claimed", async () => {
    const create = await SELF.fetch("http://local.test/worker/v1/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify(packet("wrk_test_unclaimed1")),
    });
    const job = await create.json<{ jobId: string }>();
    const result = await SELF.fetch("http://local.test/worker/v1/jobs/" + job.jobId + "/result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      body: JSON.stringify({
        schema_version: "automate.worker_result.v1",
        request_id: "wrk_test_unclaimed1",
        status: "proposed",
        changes: [],
        tests: [],
        unresolved: ["not run"],
      }),
    });
    expect(result.status).toBe(409);
  });
});

