import { describe, it, expect } from "vitest";
import { parseIntOpt, parseIntStrict } from "./utils.js";
import { CliError } from "./errors.js";

describe("parseIntStrict", () => {
  it("parses a valid integer string", () => {
    expect(parseIntStrict("42", "pr id")).toBe(42);
  });

  it("parses negative integers", () => {
    expect(parseIntStrict("-7", "val")).toBe(-7);
  });

  it("throws CliError for mixed-content input like '12abc'", () => {
    expect(() => parseIntStrict("12abc", "pr id")).toThrow(CliError);
    expect(() => parseIntStrict("12abc", "pr id")).toThrow("pr id must be an integer, got: 12abc");
  });

  it("throws CliError for non-numeric input", () => {
    expect(() => parseIntStrict("not-a-number", "label")).toThrow(CliError);
  });

  it("throws CliError for empty string", () => {
    expect(() => parseIntStrict("", "val")).toThrow(CliError);
  });
});

describe("parseIntOpt", () => {
  it("parses a valid integer string", () => {
    expect(parseIntOpt("10")).toBe(10);
  });

  it("throws CliError for mixed-content input like '12abc'", () => {
    expect(() => parseIntOpt("12abc")).toThrow(CliError);
    expect(() => parseIntOpt("12abc")).toThrow("expected integer, got: 12abc");
  });

  it("throws CliError for non-numeric input", () => {
    expect(() => parseIntOpt("not-a-number")).toThrow(CliError);
  });
});
