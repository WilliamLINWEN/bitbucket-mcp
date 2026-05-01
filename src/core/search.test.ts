import { describe, it, expect, vi } from "vitest";
import { search } from "./search.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

function makeRepo(name: string, fullName: string) {
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
  } as any;
}

describe("core/search", () => {
  it("search with one hit in repositories returns the hit in hits.repositories", async () => {
    const repo = makeRepo("my-project", "ws/my-project");
    const api = fakeApi({
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [repo],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
    });
    const result = await search(api, {
      workspace: "ws",
      query: "my-project",
      types: ["repositories"],
      limit: 10,
    });
    expect(result.hits.repositories).toHaveLength(1);
    expect(result.hits.repositories[0].item.name).toBe("my-project");
    expect(result.hits.repositories[0].repo).toBe("my-project");
    expect(result.totalHits).toBe(1);
  });

  it("search across multiple types returns hits in each respective section", async () => {
    const repo = makeRepo("my-project", "ws/my-project");
    const api = fakeApi({
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [repo],
        hasMore: false,
        next: undefined,
        pagelen: 1,
      }),
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [{
          id: 1,
          title: "my-project fix",
          description: "",
          state: "OPEN",
          author: { display_name: "Alice", username: "alice" },
          source: { branch: { name: "feature" }, repository: { full_name: "ws/my-project" } },
          destination: { branch: { name: "main" }, repository: { full_name: "ws/my-project" } },
          links: { html: { href: "https://bitbucket.org/ws/my-project/pull-requests/1" } },
        }],
        hasMore: false,
      }),
      getIssues: vi.fn().mockResolvedValue({
        issues: [{
          id: 1,
          title: "my-project bug",
          state: "open",
          priority: "major",
          kind: "bug",
          created_on: "2024-01-01T00:00:00Z",
          updated_on: "2024-01-01T00:00:00Z",
          reporter: { display_name: "Bob", username: "bob" },
          links: { html: { href: "https://bitbucket.org/ws/my-project/issues/1" } },
        }],
        hasMore: false,
      }),
    });
    const result = await search(api, {
      workspace: "ws",
      query: "my-project",
      types: ["repositories", "pull-requests", "issues"],
      limit: 10,
    });
    expect(result.hits.repositories).toHaveLength(1);
    expect(result.hits.pullRequests).toHaveLength(1);
    expect(result.hits.issues).toHaveLength(1);
    expect(result.totalHits).toBe(3);
    expect(result.sections).toHaveLength(3);
  });

  it("per-repo errors are collected in the section errors array, not thrown", async () => {
    const failRepo = makeRepo("fail-repo", "ws/fail-repo");
    const okRepo = makeRepo("ok-repo", "ws/ok-repo");
    const api = fakeApi({
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [failRepo, okRepo],
        hasMore: false,
        next: undefined,
        pagelen: 2,
      }),
      getPullRequests: vi.fn()
        .mockRejectedValueOnce(new Error("401 Unauthorized"))
        .mockResolvedValueOnce({
          pullRequests: [{
            id: 7,
            title: "ok-repo feature",
            description: "",
            state: "OPEN",
            author: { display_name: "Alice", username: "alice" },
            source: { branch: { name: "feature" }, repository: { full_name: "ws/ok-repo" } },
            destination: { branch: { name: "main" }, repository: { full_name: "ws/ok-repo" } },
            links: { html: { href: "https://bitbucket.org/ws/ok-repo/pull-requests/7" } },
          }],
          hasMore: false,
        }),
    });

    // Should not throw
    const result = await search(api, {
      workspace: "ws",
      query: "feature",
      types: ["pull-requests"],
      limit: 10,
    });

    const prSection = result.sections.find((s) => s.type === "pull-requests");
    expect(prSection).toBeDefined();
    expect(prSection!.errors).toHaveLength(1);
    expect(prSection!.errors[0].repo).toBe("fail-repo");
    expect(prSection!.errors[0].message).toContain("401 Unauthorized");
    // Successful hit still present
    expect(result.hits.pullRequests).toHaveLength(1);
    expect(result.hits.pullRequests[0].item.title).toBe("ok-repo feature");
  });

  it("calls listRepositories with pagelen: 100", async () => {
    const api = fakeApi({
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [],
        hasMore: false,
        next: undefined,
        pagelen: 0,
      }),
    });
    await search(api, {
      workspace: "ws",
      query: "anything",
      types: ["repositories"],
      limit: 10,
    });
    expect(api.listRepositories).toHaveBeenCalledWith("ws", { pagelen: 100 });
  });
});
