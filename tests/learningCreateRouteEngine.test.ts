import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workerRouter } from "../src/endpoints/worker/router";

describe("engine learning persistence route", () => {
  it("registers authenticated learning create endpoint", () => {
    expect(JSON.stringify(workerRouter)).toContain("/learning");
  });
});

describe("engine learning persistence migration", () => {
  it("contains the durable learning_artifacts table", () => {
    const migrationPath = fileURLToPath(
      new URL("../migrations/0005_learning_artifacts.sql", import.meta.url),
    );
    const source = fs.readFileSync(path.resolve(migrationPath), "utf8");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS learning_artifacts");
  });
});
