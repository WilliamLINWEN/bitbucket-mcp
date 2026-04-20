import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./search.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

function makeRepo(name: string, fullName: string, extra: Partial<any> = {}) {
  return {
    uuid: `{${name}}`,
    name,
    full_name: fullName,
    description: "",
    is_private: false,
    created_on: "2024-01-01T00:00:00Z",
    updated_on: "2024-01-01T00:00:00Z",
    language: "TypeScript",
    size: 0,
    owner: { display_name: "Owner", username: "owner" },
    links: { html: { href: `https://bitbucket.org/${fullName}` }, clone: [] },
    ...extra,
  };
}

function makeIssue(id: number, title: string) {
  return {
    id,
    title,
    state: "open",
    priority: "major",
    kind: "bug",
    created_on: "2024-01-01T00:00:00Z",
    updated_on: "2024-01-01T00:00:00Z",
    reporter: { display_name: "Alice", username: "alice" },
    links: { html: { href: `https://bitbucket.org/ws/repo/issues/${id}` } },
  };
}

function makeCommit(hash: string, message: string) {
  return {
    hash,
    message,
    author: { raw: "Alice <alice@example.com>" },
    date: "2024-01-01T00:00:00Z",
    parents: [],
    links: { html: { href: `https://bitbucket.org/ws/repo/commits/${hash}` } },
  };
}

function makePR(id: number, title: string) {
  return {
    id,
    title,
    description: "",
    state: "OPEN",
    created_on: "2024-01-01T00:00:00Z",
    updated_on: "2024-01-01T00:00:00Z",
    author: { display_name: "Alice", username: "alice" },
    source: { branch: { name: "feature" }, repository: { full_name: "ws/repo" } },
    destination: { branch: { name: "main" }, repository: { full_name: "ws/repo" } },
    links: { html: { href: "https://bitbucket.org/ws/repo/pull-requests/1" } },
  };
}

describe("search tool", () => {
  function setup(apiMethods: Record<string, any>) {
    const server = new FakeServer();
    register(server as any, apiMethods as any);
    return server.tools.get("search")!;
  }

  // Bug #2: Slug derivation — API should be called with slug, not display name
  it("calls getPullRequests with the repo slug derived from full_name, not the display name", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [makeRepo("My Nice Repo", "ws/my-nice-repo")],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [makePR(1, "my-nice-repo fix something")],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "my-nice-repo",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);

    // Must have been called with the slug "my-nice-repo", NOT "My Nice Repo"
    expect(api.getPullRequests).toHaveBeenCalledWith("ws", "my-nice-repo", undefined, undefined, undefined);
    expect(api.getPullRequests).not.toHaveBeenCalledWith("ws", "My Nice Repo", expect.anything(), expect.anything(), expect.anything());
    expect(res.content[0].text).toContain("my-nice-repo fix something");
  });

  // Bug #2 variant: same check for getIssues
  it("calls getIssues with the repo slug derived from full_name", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [makeRepo("My Nice Repo", "ws/my-nice-repo")],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getIssues: vi.fn().mockResolvedValue({
        issues: [{
          id: 42,
          title: "my-nice-repo bug",
          state: "open",
          priority: "major",
          kind: "bug",
          created_on: "2024-01-01T00:00:00Z",
          updated_on: "2024-01-01T00:00:00Z",
          reporter: { display_name: "Bob", username: "bob" },
          links: { html: { href: "https://bitbucket.org/ws/my-nice-repo/issues/42" } },
        }],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "my-nice-repo",
      types: ["issues"],
    });
    await tool.handler(input);

    expect(api.getIssues).toHaveBeenCalledWith("ws", "my-nice-repo", undefined, undefined, undefined);
    expect(api.getIssues).not.toHaveBeenCalledWith("ws", "My Nice Repo", expect.anything(), expect.anything(), expect.anything());
  });

  // Bug #2 variant: same check for getCommits
  it("calls getCommits with the repo slug derived from full_name", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [makeRepo("My Nice Repo", "ws/my-nice-repo")],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getCommits: vi.fn().mockResolvedValue({
        commits: [{
          hash: "abc12345def67890",
          message: "my-nice-repo: add feature",
          author: { raw: "Bob <bob@example.com>" },
          date: "2024-01-01T00:00:00Z",
          parents: [],
          links: { html: { href: "https://bitbucket.org/ws/my-nice-repo/commits/abc12345" } },
        }],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "my-nice-repo",
      types: ["commits"],
    });
    await tool.handler(input);

    expect(api.getCommits).toHaveBeenCalledWith("ws", "my-nice-repo", undefined, undefined, undefined);
    expect(api.getCommits).not.toHaveBeenCalledWith("ws", "My Nice Repo", expect.anything(), expect.anything(), expect.anything());
  });

  // Bug #3: Per-repo errors must be surfaced, not swallowed
  it("surfaces per-repo PR errors in output and still returns successful matches from other repos", async () => {
    const failRepo = makeRepo("fail-repo", "ws/fail-repo");
    const okRepo = makeRepo("ok-repo", "ws/ok-repo");

    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [failRepo, okRepo],
        hasMore: false,
        next: undefined,
        pagelen: 2,
      }),
      getPullRequests: vi.fn()
        .mockRejectedValueOnce(new Error("401 Unauthorized"))
        .mockResolvedValueOnce({
          pullRequests: [makePR(7, "ok-repo: add feature")],
          hasMore: false,
        }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "add feature",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    // Warning for the failed repo must appear
    expect(text).toContain("Failed to search PRs in fail-repo");
    expect(text).toContain("401 Unauthorized");
    // Successful match from the second repo still present
    expect(text).toContain("ok-repo: add feature");
  });

  // Bug #3: error warning must appear even when zero actual results found (no-results branch)
  it("includes per-repo warnings in the no-results response when all repos fail", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [makeRepo("bad-repo", "ws/bad-repo")],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getPullRequests: vi.fn().mockRejectedValue(new Error("503 Service Unavailable")),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "anything",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    expect(text).toContain("Failed to search PRs in bad-repo");
    expect(text).toContain("503 Service Unavailable");
  });

  // Bug #1: Coverage report — tool must mention repos searched
  it("reports how many repositories were searched in the output", async () => {
    const repos = Array.from({ length: 10 }, (_, i) =>
      makeRepo(`repo-${i}`, `ws/repo-${i}`)
    );

    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: repos,
        hasMore: true,
        next: "https://api.bitbucket.org/2.0/repositories/ws?page=2",
        pagelen: 10,
      }),
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "anything",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    // Should mention count of repos searched (new phrasing: "Searched all 10 retrieved repositories")
    expect(text).toContain("Searched all 10");
    // Should indicate there are more repos available
    expect(text).toContain("more available");
  });

  // Important #1: Short-circuit — coverage note must reflect actual iteration count
  it("coverage note reports N of M when limit is hit before all repos are iterated", async () => {
    const repos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`repo-${i}`, `ws/repo-${i}`)
    );

    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: repos,
        hasMore: false,
        next: undefined,
        pagelen: 5,
      }),
      // Each repo returns 3 matching PRs; limit is default 10 so after 4 repos (12 total) we break
      // With limit=3, first repo already fills it → iterCount=1, repos.length=5
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [
          makePR(1, "feat: alpha"),
          makePR(2, "feat: beta"),
          makePR(3, "feat: gamma"),
        ],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "feat",
      types: ["pull-requests"],
      limit: 3,
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    // After the first repo fills the limit (3 of 3), loop breaks — iterated 1 of 5
    expect(text).toContain("1 of 5");
    expect(text).toContain("hit limit of 3");
  });

  // Important #2: outer listRepositories failure must appear in zero-results output
  it("surfaces outer listRepositories error in zero-results response", async () => {
    const api = {
      listRepositories: vi.fn().mockRejectedValue(new Error("401 Unauthorized — bad credentials")),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "anything",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    // The outer-catch error must be preserved and surfaced
    expect(text).toContain("Pull Requests - Error:");
    expect(text).toContain("401 Unauthorized — bad credentials");
  });

  // Bug #1: pagelen=100 must be passed to listRepositories
  it("calls listRepositories with pagelen: 100", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [],
        hasMore: false,
        next: undefined,
        pagelen: 0,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "anything",
      types: ["repositories"],
    });
    await tool.handler(input);

    expect(api.listRepositories).toHaveBeenCalledWith("ws", { pagelen: 100 });
  });

  // Bug #3 (issues): per-repo getIssues error must be surfaced; successful matches from other repos still present
  it("surfaces per-repo issues errors and still returns matches from other repos", async () => {
    const failRepo = makeRepo("fail-repo", "ws/fail-repo");
    const okRepo = makeRepo("ok-repo", "ws/ok-repo");

    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [failRepo, okRepo],
        hasMore: false,
        next: undefined,
        pagelen: 2,
      }),
      getIssues: vi.fn()
        .mockRejectedValueOnce(new Error("403 Forbidden"))
        .mockResolvedValueOnce({
          issues: [makeIssue(5, "ok-repo: improve search")],
          hasMore: false,
        }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "improve search",
      types: ["issues"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    expect(text).toContain("Failed to search issues in fail-repo");
    expect(text).toContain("403 Forbidden");
    expect(text).toContain("ok-repo: improve search");
  });

  // Bug #3 (commits): per-repo getCommits error must be surfaced; successful matches from other repos still present
  it("surfaces per-repo commits errors and still returns matches from other repos", async () => {
    const failRepo = makeRepo("fail-repo", "ws/fail-repo");
    const okRepo = makeRepo("ok-repo", "ws/ok-repo");

    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [failRepo, okRepo],
        hasMore: false,
        next: undefined,
        pagelen: 2,
      }),
      getCommits: vi.fn()
        .mockRejectedValueOnce(new Error("500 Internal Server Error"))
        .mockResolvedValueOnce({
          commits: [makeCommit("abc12345def67890", "ok-repo: refactor handler")],
          hasMore: false,
        }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "refactor",
      types: ["commits"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    expect(text).toContain("Failed to search commits in fail-repo");
    expect(text).toContain("500 Internal Server Error");
    expect(text).toContain("ok-repo: refactor handler");
  });

  // Happy path: existing behavior still works
  it("happy path — PR matches come back formatted correctly", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [makeRepo("my-project", "ws/my-project")],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [makePR(42, "fix: resolve login bug")],
        hasMore: false,
      }),
    };
    const tool = setup(api);
    const input = parse(tool.schema, {
      workspace: "ws",
      query: "login",
      types: ["pull-requests"],
    });
    const res = await tool.handler(input);
    const text = res.content[0].text;

    expect(text).toContain("PR #42");
    expect(text).toContain("fix: resolve login bug");
    expect(text).toContain("OPEN");
    expect(text).toContain("Alice");
  });
});
