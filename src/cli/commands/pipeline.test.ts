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
    const cmd = buildPipelineCommand({ json: true });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.listPipelines).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", page: undefined, pagelen: undefined,
    });
  });

  it("`pipeline view abc -r r1` calls core", async () => {
    vi.spyOn(pipelinesCore, "getPipeline").mockResolvedValue({ uuid: "abc" } as any);
    const cmd = buildPipelineCommand({ json: true });
    await cmd.parseAsync(["view", "abc", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.getPipeline).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "abc",
    });
  });

  it("`pipeline trigger -r r1 --branch main --var FOO=BAR` parses variables", async () => {
    vi.spyOn(pipelinesCore, "triggerPipeline").mockResolvedValue({ uuid: "p" } as any);
    const cmd = buildPipelineCommand({ json: true });
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

  it("`pipeline trigger -r r1` without ref/commit throws", async () => {
    const cmd = buildPipelineCommand({ json: true });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["trigger", "-r", "r1"], { from: "user" }),
    ).rejects.toThrow();
  });

  it("`pipeline trigger -r r1 --branch main --tag v1` rejects conflicting refs", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: any) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as any;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const cmd = buildPipelineCommand({ json: true });
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(["trigger", "-r", "r1", "--branch", "main", "--tag", "v1"], { from: "user" }),
      ).rejects.toThrow(/__exit/);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
      expect(stderr).toMatch(/--branch.*--tag|only one/i);
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("`pipeline step list p1 -r r1` calls core", async () => {
    vi.spyOn(pipelinesCore, "listPipelineSteps").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildPipelineCommand({ json: true });
    await cmd.parseAsync(["step", "list", "p1", "-r", "r1"], { from: "user" });
    expect(pipelinesCore.listPipelineSteps).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1",
      page: undefined, pagelen: undefined,
    });
  });

  it("`pipeline step log p1 s1 -r r1` prints the log", async () => {
    vi.spyOn(pipelinesCore, "getPipelineStepLog").mockResolvedValue({ log: "abc" });
    const cmd = buildPipelineCommand({ json: true });
    await cmd.parseAsync(["step", "log", "p1", "s1", "-r", "r1"], { from: "user" });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("abc");
  });
});
