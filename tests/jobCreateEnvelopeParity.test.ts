import { describe, expect, it } from "vitest";

describe("main worker job-create envelope parity", () => {
  it("accepts learning and research envelope schemas", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/endpoints/worker/jobCreate.ts", "utf8").catch(() => "");
    expect(source).toContain("LearningHandoffEnvelope");
    expect(source).toContain("ResearchJobEnvelope");
  });
});
