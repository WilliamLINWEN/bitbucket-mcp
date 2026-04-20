import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pipelines.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pipelines tool", () => {
  it("lists pipelines when pipeline_uuid is absent", async () => {
    const api = {
      listPipelines: vi.fn().mockResolvedValue({
        pipelines: [{
          uuid: "{abc}",
          build_number: 1,
          state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
          created_on: "2024-01-01T00:00:00Z",
          target: { ref_name: "main", commit: { hash: "abc123" } },
          creator: { display_name: "Alice", username: "alice" },
        }],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pipelines")!;
    const res = await tool.handler(parse(tool.schema, { workspace: "ws", repo_slug: "r" }));
    expect(api.listPipelines).toHaveBeenCalled();
    expect(res.content[0].text).toContain("Found 1 pipelines for 'ws/r'");
  });

  it("fetches single pipeline when pipeline_uuid is present", async () => {
    const api = {
      getPipeline: vi.fn().mockResolvedValue({
        uuid: "{abc}",
        build_number: 7,
        state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
        created_on: "2024-01-01T00:00:00Z",
        completed_on: "2024-01-01T00:05:00Z",
        build_seconds_used: 300,
        target: { ref_name: "main", commit: { hash: "abc123" } },
        creator: { display_name: "Alice", username: "alice" },
        links: { html: { href: "https://bitbucket.org/ws/r/pipelines/{abc}" } },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pipelines")!;
    const res = await tool.handler(parse(tool.schema, { workspace: "ws", repo_slug: "r", pipeline_uuid: "{abc}" }));
    expect(api.getPipeline).toHaveBeenCalledWith("ws", "r", "{abc}");
    expect(res.content[0].text).toContain("**Pipeline #7** ({abc})");
  });

  it("registers relocated trigger-pipeline tool", () => {
    const server = new FakeServer();
    register(server as any, {} as any);
    expect(server.tools.has("trigger-pipeline")).toBe(true);
  });
});

describe("pipeline-steps tool", () => {
  function setup(apiMethods: Record<string, any>) {
    const server = new FakeServer();
    register(server as any, apiMethods as any);
    return server.tools.get("pipeline-steps")!;
  }

  it('action="list" calls listPipelineSteps and emits success output', async () => {
    const api = {
      listPipelineSteps: vi.fn().mockResolvedValue({
        steps: [{
          uuid: "{s1}",
          name: "build-and-test",
          state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
        }],
      }),
    };
    const tool = setup(api);
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "{p}", action: "list",
    }));
    expect(api.listPipelineSteps).toHaveBeenCalled();
    expect(res.content[0].text).toContain("Found 1 steps for pipeline '{p}' in 'ws/r'");
  });

  it('action="get" calls getPipelineStep with step_uuid and emits success output', async () => {
    const api = {
      getPipelineStep: vi.fn().mockResolvedValue({
        uuid: "{s1}",
        name: "build-and-test",
        state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
      }),
    };
    const tool = setup(api);
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "{p}", step_uuid: "{s1}", action: "get",
    }));
    expect(api.getPipelineStep).toHaveBeenCalledWith("ws", "r", "{p}", "{s1}");
    expect(res.content[0].text).toContain("**Step: build-and-test** ({s1})");
  });

  it('action="log" calls getPipelineStepLog with step_uuid and emits success output', async () => {
    const api = { getPipelineStepLog: vi.fn().mockResolvedValue("log contents here") };
    const tool = setup(api);
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "{p}", step_uuid: "{s1}", action: "log",
    }));
    expect(api.getPipelineStepLog).toHaveBeenCalledWith("ws", "r", "{p}", "{s1}");
    expect(res.content[0].text).toContain("log contents here");
  });

  it('action="get" without step_uuid returns a clear error', async () => {
    const tool = setup({});
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "{p}", action: "get",
    }));
    expect(res.content[0].text).toMatch(/step_uuid is required when action is "get" or "log"/);
  });

  it('action="log" without step_uuid returns a clear error', async () => {
    const tool = setup({});
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "{p}", action: "log",
    }));
    expect(res.content[0].text).toMatch(/step_uuid is required when action is "get" or "log"/);
  });
});
