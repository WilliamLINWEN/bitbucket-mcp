import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSearchCommand } from "./search.js";
import * as searchCore from "../../core/search.js";
import type { SearchResult } from "../../core/types.js";

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    workspace: "acme",
    query: "test",
    totalRepos: 1,
    hasMoreRepos: false,
    hits: {
      repositories: [],
      pullRequests: [],
      issues: [],
      commits: [],
    },
    sections: [],
    totalHits: 0,
    ...overrides,
  };
}

describe("cli search command", () => {
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

  it("`search myquery` calls core with default types and limit", async () => {
    vi.spyOn(searchCore, "search").mockResolvedValue(makeSearchResult() as any);
    const cmd = buildSearchCommand({ json: true, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    expect(searchCore.search).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      query: "myquery",
      types: ["repositories", "pull-requests", "issues"],
      limit: 10,
    });
  });

  it("`search myquery --types repositories,commits --limit 5` passes custom options", async () => {
    vi.spyOn(searchCore, "search").mockResolvedValue(makeSearchResult() as any);
    const cmd = buildSearchCommand({ json: true, pretty: false });
    await cmd.parseAsync(["myquery", "--types", "repositories,commits", "--limit", "5"], { from: "user" });
    expect(searchCore.search).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      query: "myquery",
      types: ["repositories", "commits"],
      limit: 5,
    });
  });

  it("`search myquery` outputs summary in text mode with hits", async () => {
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 1,
      hasMoreRepos: false,
      hits: {
        repositories: [
          { type: "repositories", repo: "my-repo", item: { name: "my-repo", description: "Test repo", is_private: false, language: "TypeScript", links: { html: { href: "https://bitbucket.org/acme/my-repo" } } } as any },
        ],
        pullRequests: [],
        issues: [],
        commits: [],
      },
      sections: [{ type: "repositories", searched: 1, totalRepos: 1, hasMoreRepos: false, errors: [] }],
      totalHits: 1,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("repositories: 1 hits");
    expect(written).toContain("my-repo");
  });

  it("`search myquery` text mode shows per-section coverage line", async () => {
    const repoHits = [{
      type: "repositories",
      repo: "r1",
      item: { name: "r1", description: "d", is_private: false, language: "TypeScript", links: { html: { href: "" } } } as any,
    }];
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 10,
      hasMoreRepos: false,
      hits: { repositories: repoHits, pullRequests: [], issues: [], commits: [] },
      sections: [{ type: "repositories", searched: 3, totalRepos: 10, hasMoreRepos: false, errors: [] }],
      totalHits: 1,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("searched 3 of 10 repos");
    expect(written).not.toContain("(more available)");
  });

  it("`search myquery` text mode marks hasMoreRepos with '(more available)'", async () => {
    const repoHits = [{
      type: "repositories",
      repo: "r1",
      item: { name: "r1", description: "d", is_private: false, language: "TypeScript", links: { html: { href: "" } } } as any,
    }];
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 10,
      hasMoreRepos: true,
      hits: { repositories: repoHits, pullRequests: [], issues: [], commits: [] },
      sections: [{ type: "repositories", searched: 10, totalRepos: 10, hasMoreRepos: true, errors: [] }],
      totalHits: 1,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("searched 10 of 10 repos (more available)");
  });

  it("`search myquery` text mode header omits prefix when K === N", async () => {
    const repoHits = [1, 2, 3].map((i) => ({
      type: "repositories",
      repo: `repo-${i}`,
      item: { name: `repo-${i}`, description: `desc-${i}`, is_private: false, language: "TypeScript", links: { html: { href: "" } } } as any,
    }));
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 3,
      hasMoreRepos: false,
      hits: { repositories: repoHits, pullRequests: [], issues: [], commits: [] },
      sections: [{ type: "repositories", searched: 3, totalRepos: 3, hasMoreRepos: false, errors: [] }],
      totalHits: 3,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Repositories:");
    expect(written).not.toContain("(showing 3 of 3)");
  });

  it("`search myquery` text mode header includes 'showing K of N' when K < N", async () => {
    const repoHits = Array.from({ length: 7 }, (_, i) => ({
      type: "repositories",
      repo: `repo-${i}`,
      item: { name: `repo-${i}`, description: `desc-${i}`, is_private: false, language: "TypeScript", links: { html: { href: "" } } } as any,
    }));
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 7,
      hasMoreRepos: false,
      hits: { repositories: repoHits, pullRequests: [], issues: [], commits: [] },
      sections: [{ type: "repositories", searched: 7, totalRepos: 7, hasMoreRepos: false, errors: [] }],
      totalHits: 7,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Repositories (showing 5 of 7):");
  });

  it("`search myquery` outputs 'No results found' when totalHits is 0", async () => {
    vi.spyOn(searchCore, "search").mockResolvedValue(makeSearchResult() as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain(`No results found for "myquery"`);
  });

  it("`search myquery` in JSON mode outputs full SearchResult", async () => {
    const mockResult = makeSearchResult({ query: "myquery", workspace: "acme" });
    vi.spyOn(searchCore, "search").mockResolvedValue(mockResult as any);
    const cmd = buildSearchCommand({ json: true, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const parsed = JSON.parse(written);
    expect(parsed.query).toBe("myquery");
    expect(parsed.hits).toBeDefined();
  });

  it("`search` without a query argument fails", async () => {
    const cmd = buildSearchCommand({ json: true, pretty: false });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync([], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });

  it("`search myquery` text mode caps display at TEXT_DISPLAY_CAP (5) per type", async () => {
    const repoHits = Array.from({ length: 12 }, (_, i) => ({
      type: "repositories",
      repo: `repo-${i}`,
      item: { name: `repo-${i}`, description: `desc-${i}`, is_private: false, language: "TypeScript", links: { html: { href: "" } } } as any,
    }));
    vi.spyOn(searchCore, "search").mockResolvedValue({
      workspace: "acme",
      query: "myquery",
      totalRepos: 12,
      hasMoreRepos: false,
      hits: { repositories: repoHits, pullRequests: [], issues: [], commits: [] },
      sections: [{ type: "repositories", searched: 12, totalRepos: 12, hasMoreRepos: false, errors: [] }],
      totalHits: 12,
    } as any);
    const cmd = buildSearchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["myquery"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Repositories (showing 5 of 12):");
    expect(written).toContain("repo-0");
    expect(written).toContain("repo-4");
    expect(written).not.toContain("repo-5"); // capped
  });
});
