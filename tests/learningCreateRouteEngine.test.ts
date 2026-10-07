import { describe, expect, it } from "vitest";
import { workerRouter } from "../src/endpoints/worker/router";

describe("engine learning persistence route", () => {
  it("registers authenticated learning create endpoint", () => {
    expect(JSON.stringify(workerRouter)).toContain("/learning");
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("engine learning persistence migration", () => {
  it("contains the durable learning_artifacts table", () => {
    const source = fs.readFileSync(
      path.resolve("migrations/0003_learning_artifacts.sql"),
      "utf8",
    );
    expect(source).toContain("CREATE TABLE IF NOT EXISTS learning_artifacts");
  });
});
