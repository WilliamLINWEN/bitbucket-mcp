import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./commits.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("commits tool", () => {
  it("lists commits when commit_hash is absent", async () => {
    const api = {
      getCommits: vi.fn().mockResolvedValue({
        commits: [{
          hash: "abcdef0123456",
          message: "initial commit",
          author: { raw: "Dev <dev@x>" },
          date: "2024-01-01T00:00:00Z",
          links: { html: { href: "http://x" } },
        }],
        hasMore: false,
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("commits")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r" });
    const res = await tool.handler(input);
    expect(api.getCommits).toHaveBeenCalled();
    expect(res.content[0].text).toContain("Found 1 recent commits in 'ws/r'");
  });

  it("fetches single commit when commit_hash is present", async () => {
    const api = {
      getCommit: vi.fn().mockResolvedValue({
        hash: "abcdef0123456",
        message: "initial commit",
        author: { raw: "Dev <dev@x>" },
        date: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
        parents: [],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("commits")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", commit_hash: "abcdef0123456" });
    const res = await tool.handler(input);
    expect(api.getCommit).toHaveBeenCalledWith("ws", "r", "abcdef0123456");
    expect(res.content[0].text).toContain("# 💾 Commit abcdef01");
  });
});
