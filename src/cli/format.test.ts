import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emitPaginated } from "./format.js";
import type { OutputContext } from "./format.js";

describe("emitPaginated", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function captureOutput(): string {
    return stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
  }

  it("text mode without next → output is body + newline, no hint line", () => {
    const ctx: OutputContext = { json: false, pretty: false };
    const result: { items: string[]; hasMore: boolean; next?: string } = { items: ["a", "b"], hasMore: false };
    emitPaginated(ctx, result, () => "line1\nline2");
    expect(captureOutput()).toBe("line1\nline2\n");
  });

  it("text mode with next → output ends with next-page hint", () => {
    const ctx: OutputContext = { json: false, pretty: false };
    const result = { items: ["a"], hasMore: true, next: "https://example.com/next?page=2" };
    emitPaginated(ctx, result, () => "line1");
    const output = captureOutput();
    expect(output).toBe("line1\n\nnext page: --page 'https://example.com/next?page=2'\n");
  });

  it("JSON mode with next → parsed output equals result merged with _hint", () => {
    const ctx: OutputContext = { json: true, pretty: false };
    const result = { items: ["a"], hasMore: true, next: "https://example.com/next?page=2" };
    emitPaginated(ctx, result, () => "should not be called");
    const parsed = JSON.parse(captureOutput());
    expect(parsed).toEqual({
      ...result,
      _hint: "More results: re-invoke with --page=<value of next>.",
    });
  });

  it("JSON mode without next → parsed output equals result exactly, no _hint", () => {
    const ctx: OutputContext = { json: true, pretty: false };
    const result: { items: string[]; hasMore: boolean; next?: string } = { items: ["a", "b"], hasMore: false };
    emitPaginated(ctx, result, () => "should not be called");
    const parsed = JSON.parse(captureOutput());
    expect(parsed).toEqual(result);
    expect(parsed).not.toHaveProperty("_hint");
  });
});
