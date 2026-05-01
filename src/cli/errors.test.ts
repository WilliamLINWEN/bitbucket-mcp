import { describe, it, expect } from "vitest";
import { classifyError, CliError } from "./errors.js";

describe("classifyError", () => {
  it("preserves CliError's exitCode", () => {
    expect(classifyError(new CliError("bad arg")).exitCode).toBe(1);
    expect(classifyError(new CliError("hard fail", 7)).exitCode).toBe(7);
  });

  it("classifies caller-shaped messages as exit 1", () => {
    expect(classifyError(new Error("workspace required")).exitCode).toBe(1);
    expect(classifyError(new Error("invalid repository slug")).exitCode).toBe(1);
  });

  it("maps HTTP status substrings to exit 2", () => {
    expect(classifyError(new Error("Bitbucket API error: 401 Unauthorized")).exitCode).toBe(2);
    expect(classifyError(new Error("HTTP 503 from upstream")).exitCode).toBe(2);
  });

  it("falls through to exit 3 for unrecognized errors", () => {
    expect(classifyError(new Error("kaboom")).exitCode).toBe(3);
  });
});
