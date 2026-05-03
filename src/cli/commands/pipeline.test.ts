import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPipelineCommand } from "./pipeline.js";
import * as pipelinesCore from "../../core/pipelines.js";

describe("cli pipeline command", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.env.BITBUCKET_WORKSPACE = "acme";
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
    delete process.env.BITBUCKET_WORKSPACE;
  });

  it("`pipeline list -r r1` calls core", async () => {
    vi.spyOn(pipelinesCore, "listPipelines").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildPipelineCommand({ json: true, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.listPipelines).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", page: undefined, pagelen: undefined,
    });
  });

  it("`pipeline view abc -r r1` calls core", async () => {
    vi.spyOn(pipelinesCore, "getPipeline").mockResolvedValue({ uuid: "abc" } as any);
    const cmd = buildPipelineCommand({ json: true, pretty: false });
    await cmd.parseAsync(["view", "abc", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.getPipeline).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "abc",
    });
  });

  it("`pipeline trigger -r r1 --branch main --var FOO=BAR` parses variables", async () => {
    vi.spyOn(pipelinesCore, "triggerPipeline").mockResolvedValue({ uuid: "p" } as any);
    const cmd = buildPipelineCommand({ json: true, pretty: false });
    await cmd.parseAsync(
      ["trigger", "-r", "r1", "--branch", "main", "--var", "FOO=BAR"],
      { from: "user" },
    );
    expect(pipelinesCore.triggerPipeline).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workspace: "acme", repo_slug: "r1",
      ref_type: "branch", ref_name: "main",
      variables: [{ key: "FOO", value: "BAR" }],
    }));
  });

  it("`pipeline trigger -r r1` without ref/commit throws with mutual-exclusion hint", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as any;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(["trigger", "-r", "r1"], { from: "user" }),
      ).rejects.toThrow(/__exit/);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(stderr).toContain(
        "Provide exactly one of --branch, --tag, or --commit (mutually exclusive)",
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("`pipeline trigger -r r1 --branch main --tag v1` rejects conflicting refs", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as any;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(["trigger", "-r", "r1", "--branch", "main", "--tag", "v1"], { from: "user" }),
      ).rejects.toThrow(/__exit/);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(stderr).toContain(
        "Provide exactly one of --branch, --tag, or --commit (mutually exclusive)",
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("`pipeline trigger -r r1 --branch main --commit abc` rejects conflicting refs", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as any;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(["trigger", "-r", "r1", "--branch", "main", "--commit", "abc"], { from: "user" }),
      ).rejects.toThrow(/__exit/);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(stderr).toContain(
        "Provide exactly one of --branch, --tag, or --commit (mutually exclusive)",
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("`pipeline trigger -r r1 --tag v1 --commit abc` rejects conflicting refs", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as any;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(["trigger", "-r", "r1", "--tag", "v1", "--commit", "abc"], { from: "user" }),
      ).rejects.toThrow(/__exit/);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(stderr).toContain(
        "Provide exactly one of --branch, --tag, or --commit (mutually exclusive)",
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("`pipeline step list p1 -r r1` calls core", async () => {
    vi.spyOn(pipelinesCore, "listPipelineSteps").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildPipelineCommand({ json: true, pretty: false });
    await cmd.parseAsync(["step", "list", "p1", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.listPipelineSteps).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1",
      page: undefined, pagelen: undefined,
    });
  });

  it("`pipeline step log p1 s1 -r r1` prints the log", async () => {
    vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: "abc" });
    const cmd = buildPipelineCommand({ json: true, pretty: false });
    await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1"], { from: "user" });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("abc");
  });

  describe("`pipeline step log` tail/head", () => {
    function makeLog(n: number): string {
      return Array.from({ length: n }, (_, i) => `line${i + 1}`).join("\n");
    }

    it("default behavior: 600-line log → last 500 lines + truncation notice", async () => {
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: makeLog(600) });
      const cmd = buildPipelineCommand({ json: false, pretty: false });
      await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1"], { from: "user" });
      const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(out).toContain("line101");   // first line of last 500
      expect(out).not.toContain("line100"); // truncated
      expect(out).toContain("(truncated: 100 earlier lines");
    });

    it("--tail 0: 600-line log → full 600 lines, no notice", async () => {
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: makeLog(600) });
      const cmd = buildPipelineCommand({ json: false, pretty: false });
      await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1", "--tail", "0"], { from: "user" });
      const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(out).toContain("line1");
      expect(out).toContain("line600");
      expect(out).not.toContain("truncated");
    });

    it("--head 10: 600-line log → first 10 lines + truncation notice", async () => {
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: makeLog(600) });
      const cmd = buildPipelineCommand({ json: false, pretty: false });
      await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1", "--head", "10"], { from: "user" });
      const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(out).toContain("line10");
      expect(out).not.toContain("line11");
      expect(out).toContain("(truncated: 590 later lines — re-run with --head 0 for full log)");
    });

    it("--tail 5 --head 5 throws CliError (mutually exclusive)", async () => {
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: makeLog(600) });
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
        throw new Error(`__exit:${code ?? 0}`);
      }) as any;
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const cmd = buildPipelineCommand({ json: false, pretty: false });
        cmd.exitOverride();
        await expect(
          cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1", "--tail", "5", "--head", "5"], { from: "user" }),
        ).rejects.toThrow(/__exit/);
        const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
        expect(stderr).toMatch(/--tail.*--head.*mutually exclusive/);
      } finally {
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
      }
    });

    it("JSON mode includes truncatedLines: 100 for 600-line log with default tail", async () => {
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: makeLog(600) });
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1"], { from: "user" });
      const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      const parsed = JSON.parse(out);
      expect(parsed.truncatedLines).toBe(100);
    });

    it("trailing newline edge: 500-line log ending in \\n → no truncation", async () => {
      const log500 = makeLog(500) + "\n"; // exactly 500 lines with trailing newline
      vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: log500 });
      const cmd = buildPipelineCommand({ json: true, pretty: false });
      await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1"], { from: "user" });
      const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      const parsed = JSON.parse(out);
      expect(parsed.truncatedLines).toBe(0);
    });
  });
});
