import { describe, it, expect } from "vitest";
import { classifyError, CliError, AUTH_HINT } from "./errors.js";

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

  it("appends AUTH_HINT to 401 messages", () => {
    const result = classifyError(new Error("Bitbucket API error: 401 Unauthorized"));
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain(AUTH_HINT);
  });

  it("appends AUTH_HINT to 403 messages", () => {
    const result = classifyError(new Error("HTTP 403 Forbidden"));
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain(AUTH_HINT);
  });

  it("does NOT append AUTH_HINT to 404 messages", () => {
    const result = classifyError(new Error("HTTP 404 Not Found"));
    expect(result.exitCode).toBe(2);
    expect(result.message).not.toContain(AUTH_HINT);
  });

  it("does NOT append AUTH_HINT to 409 messages", () => {
    const result = classifyError(new Error("HTTP 409 Conflict"));
    expect(result.exitCode).toBe(2);
    expect(result.message).not.toContain(AUTH_HINT);
  });

  it("does NOT append AUTH_HINT to 429 messages", () => {
    const result = classifyError(new Error("HTTP 429 Too Many Requests"));
    expect(result.exitCode).toBe(2);
    expect(result.message).not.toContain(AUTH_HINT);
  });

  it("does NOT append AUTH_HINT to 5xx messages", () => {
    const result = classifyError(new Error("HTTP 503 Service Unavailable"));
    expect(result.exitCode).toBe(2);
    expect(result.message).not.toContain(AUTH_HINT);
  });
});
