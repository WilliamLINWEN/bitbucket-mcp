import { describe, it, expect, vi } from "vitest";
import { listCommits, getCommit } from "./commits.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

describe("core/commits", () => {
  it("listCommits reshapes commits → items with branch and pagination", async () => {
    const api = fakeApi({
      getCommits: vi.fn().mockResolvedValue({
        commits: [{ hash: "abc123def456" } as any],
        page: 1,
        pagelen: 10,
        next: "https://next-page",
        hasMore: true,
      }),
    });
    const result = await listCommits(api, {
      workspace: "acme",
      repo_slug: "r1",
      branch: "main",
      page: "1",
      pagelen: 10,
    });
    expect(result.items).toEqual([{ hash: "abc123def456" }]);
    expect(result.page).toBe(1);
    expect(result.pagelen).toBe(10);
    expect(result.next).toBe("https://next-page");
    expect(result.hasMore).toBe(true);
    expect(api.getCommits).toHaveBeenCalledWith("acme", "r1", "main", "1", 10);
  });

  it("listCommits without optional fields delegates correctly", async () => {
    const api = fakeApi({
      getCommits: vi.fn().mockResolvedValue({
        commits: [],
        hasMore: false,
      }),
    });
    const result = await listCommits(api, { workspace: "ws", repo_slug: "repo" });
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(api.getCommits).toHaveBeenCalledWith("ws", "repo", undefined, undefined, undefined);
  });

  it("getCommit delegates to api.getCommit with hash", async () => {
    const commit = { hash: "abcdef01234567890", message: "fix bug" } as any;
    const api = fakeApi({
      getCommit: vi.fn().mockResolvedValue(commit),
    });
    const result = await getCommit(api, {
      workspace: "acme",
      repo_slug: "r1",
      commit_hash: "abcdef01234567890",
    });
    expect(result).toEqual(commit);
    expect(api.getCommit).toHaveBeenCalledWith("acme", "r1", "abcdef01234567890");
  });
});
