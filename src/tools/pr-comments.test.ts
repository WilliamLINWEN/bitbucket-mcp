import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pr-comments.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pr-comments tool", () => {
  it("dispatches to list when comment_id is absent", async () => {
    const api = {
      getPullRequestComments: vi.fn().mockResolvedValue({
        comments: [{
          id: 99, content: { raw: "hello" },
          user: { display_name: "u", username: "u" },
          created_on: "2024-01-01T00:00:00Z",
          updated_on: "2024-01-01T00:00:00Z",
          links: { html: { href: "http://x" } },
        }],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pr-comments")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pr_id: 1 });
    const res = await tool.handler(input);
    expect(api.getPullRequestComments).toHaveBeenCalled();
    expect(res.content[0].text).toContain("Found 1 comments on PR #1");
  });

  it("dispatches to single-comment when comment_id is present", async () => {
    const api = {
      getPullRequestComment: vi.fn().mockResolvedValue({
        id: 99, content: { raw: "hello" },
        user: { display_name: "u", username: "u" },
        created_on: "2024-01-01T00:00:00Z",
        updated_on: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pr-comments")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pr_id: 1, comment_id: 99 });
    const res = await tool.handler(input);
    expect(api.getPullRequestComment).toHaveBeenCalledWith("ws", "r", 1, 99);
    expect(res.content[0].text).toContain("#99");
  });

  it("registers relocated create-pr-comment", () => {
    const server = new FakeServer();
    register(server as any, {} as any);
    expect(server.tools.has("create-pr-comment")).toBe(true);
  });
});
