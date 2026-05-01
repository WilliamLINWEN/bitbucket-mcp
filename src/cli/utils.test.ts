import { describe, it, expect } from "vitest";
import { parseIntOpt, parseIntStrict, parsePagelenOpt } from "./utils.js";
import { CliError } from "./errors.js";

describe("parseIntStrict", () => {
  it("parses a valid integer string", () => {
    expect(parseIntStrict("42", "pr id")).toBe(42);
  });

  it("throws CliError for negative integers", () => {
    expect(() => parseIntStrict("-7", "val")).toThrow(CliError);
    expect(() => parseIntStrict("-7", "val")).toThrow("val must be a positive integer, got: -7");
  });

  it("throws CliError for zero", () => {
    expect(() => parseIntStrict("0", "pr id")).toThrow(CliError);
    expect(() => parseIntStrict("0", "pr id")).toThrow("pr id must be a positive integer, got: 0");
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

  it("throws CliError for negative integer", () => {
    expect(() => parseIntOpt("-1")).toThrow(CliError);
    expect(() => parseIntOpt("-1")).toThrow("expected positive integer, got: -1");
  });

  it("throws CliError for zero", () => {
    expect(() => parseIntOpt("0")).toThrow(CliError);
    expect(() => parseIntOpt("0")).toThrow("expected positive integer, got: 0");
  });

  it("throws CliError for mixed-content input like '12abc'", () => {
    expect(() => parseIntOpt("12abc")).toThrow(CliError);
    expect(() => parseIntOpt("12abc")).toThrow("expected integer, got: 12abc");
  });

  it("throws CliError for non-numeric input", () => {
    expect(() => parseIntOpt("not-a-number")).toThrow(CliError);
  });
});

describe("parsePagelenOpt", () => {
  it("accepts the boundary values", () => {
    expect(parsePagelenOpt("10")).toBe(10);
    expect(parsePagelenOpt("100")).toBe(100);
  });

  it("rejects values below 10", () => {
    expect(() => parsePagelenOpt("5")).toThrow(/10 and 100/);
  });

  it("rejects values above 100", () => {
    expect(() => parsePagelenOpt("500")).toThrow(/10 and 100/);
  });

  it("rejects non-positive integers", () => {
    expect(() => parsePagelenOpt("0")).toThrow(CliError);
    expect(() => parsePagelenOpt("-1")).toThrow(CliError);
  });

  it("rejects non-integer input", () => {
    expect(() => parsePagelenOpt("abc")).toThrow(CliError);
  });
});
