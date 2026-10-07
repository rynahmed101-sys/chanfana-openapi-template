import { describe, expect, it } from "vitest";

describe("verification runner identity binding", () => {
  it("binds verification results to request_id and source_revision", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/worker/jobRunner.ts", "utf8");
    expect(source).toContain("Verification result request_id does not match the requested verification job");
    expect(source).toContain("Verification result source_revision does not match the requested revision");
    expect(source).not.toContain("discovery.discovery_grant");
  });
});
