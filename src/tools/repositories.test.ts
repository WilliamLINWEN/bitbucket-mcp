import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./repositories.js";

type Registered = {
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: any) => Promise<any>;
};

class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(
    name: string,
    config: { description?: string; inputSchema?: Record<string, z.ZodTypeAny> },
    handler: (args: any) => Promise<any>,
  ) {
    this.tools.set(name, { schema: config.inputSchema ?? {}, handler });
  }
}

function parse(schema: Record<string, z.ZodTypeAny>, input: Record<string, unknown>) {
  return z.object(schema).parse(input);
}

describe("repositories tool", () => {
  it("dispatches to list when repo_slug is absent", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [{
          name: "r1", description: "", language: "", is_private: false, size: 1,
          created_on: "2024-01-01T00:00:00Z", updated_on: "2024-01-01T00:00:00Z",
          owner: { display_name: "u", username: "u" },
          links: { html: { href: "http://x" } },
        }],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("repositories")!;
    const input = parse(tool.schema, { workspace: "ws" });
    const res = await tool.handler(input);
    expect(api.listRepositories).toHaveBeenCalledWith("ws", expect.any(Object));
    expect(res.content[0].text).toContain("Found 1 repositories");
  });

  it("dispatches to single-repo when repo_slug is present", async () => {
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        name: "r1", full_name: "ws/r1", description: "", language: "", is_private: false,
        size: 1, created_on: "2024-01-01T00:00:00Z", updated_on: "2024-01-01T00:00:00Z",
        owner: { display_name: "u", username: "u" },
        links: { html: { href: "http://x" }, clone: [] },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("repositories")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r1" });
    const res = await tool.handler(input);
    expect(api.getRepository).toHaveBeenCalledWith("ws", "r1");
    expect(res.content[0].text).toContain("# r1");
  });
});
