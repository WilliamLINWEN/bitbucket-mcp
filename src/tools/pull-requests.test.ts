import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pull-requests.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pull-requests tool", () => {
  it("dispatches to list when pr_id is absent", async () => {
    const api = {
      getPullRequests: vi.fn().mockResolvedValue({ pullRequests: [] }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pull-requests")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r" });
    await tool.handler(input);
    expect(api.getPullRequests).toHaveBeenCalled();
  });

  it("dispatches to single-pr when pr_id is present", async () => {
    const api = {
      getPullRequest: vi.fn().mockResolvedValue({
        id: 1, title: "t", state: "OPEN",
        author: { display_name: "u", username: "u" },
        source: { branch: { name: "s" }, repository: { full_name: "ws/r" } },
        destination: { branch: { name: "d" }, repository: { full_name: "ws/r" } },
        created_on: "2024-01-01T00:00:00Z",
        updated_on: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
        description: "",
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pull-requests")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pr_id: 1 });
    const res = await tool.handler(input);
    expect(api.getPullRequest).toHaveBeenCalledWith("ws", "r", 1);
    expect(res.content[0].text).toContain("Pull Request #1");
  });

  it("registers relocated create-pull-request, update-pr-description, get-pr-diff", () => {
    const server = new FakeServer();
    register(server as any, {} as any);
    expect(server.tools.has("create-pull-request")).toBe(true);
    expect(server.tools.has("update-pr-description")).toBe(true);
    expect(server.tools.has("get-pr-diff")).toBe(true);
  });
});
