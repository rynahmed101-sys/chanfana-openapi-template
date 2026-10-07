import { describe, expect, it } from "vitest";
import { WorkerJobCreate } from "../src/endpoints/worker/jobCreate";

describe("main worker job-create envelope parity", () => {
  it("includes learning and research envelopes in the validated request union", () => {
    const route = new WorkerJobCreate();
    const bodySchema = route.schema.request.body;
    expect(bodySchema).toBeDefined();
    expect(bodySchema.content?.["application/json"]?.schema).toBeDefined();
    const schema = bodySchema.content["application/json"].schema;
    const refs = JSON.stringify(schema);
    expect(refs).toContain("LearningHandoffEnvelope");
    expect(refs).toContain("ResearchJobEnvelope");
  });
});
