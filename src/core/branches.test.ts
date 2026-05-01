import { describe, it, expect, vi } from "vitest";
import { listBranches } from "./branches.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

describe("core/branches", () => {
  it("listBranches reshapes branches → items with pagination", async () => {
    const api = fakeApi({
      getBranches: vi.fn().mockResolvedValue({
        branches: [{ name: "main" } as any],
        page: 1,
        pagelen: 10,
        next: "https://next-page",
        hasMore: true,
      }),
    });
    const result = await listBranches(api, {
      workspace: "acme",
      repo_slug: "r1",
      page: "1",
      pagelen: 10,
    });
    expect(result.items).toEqual([{ name: "main" }]);
    expect(result.page).toBe(1);
    expect(result.pagelen).toBe(10);
    expect(result.next).toBe("https://next-page");
    expect(result.hasMore).toBe(true);
    expect(api.getBranches).toHaveBeenCalledWith("acme", "r1", "1", 10);
  });

  it("listBranches without optional fields delegates correctly", async () => {
    const api = fakeApi({
      getBranches: vi.fn().mockResolvedValue({
        branches: [],
        hasMore: false,
      }),
    });
    const result = await listBranches(api, { workspace: "ws", repo_slug: "repo" });
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(api.getBranches).toHaveBeenCalledWith("ws", "repo", undefined, undefined);
  });

  it("listBranches passes all returned branches as items", async () => {
    const branches = [
      { name: "main" } as any,
      { name: "develop" } as any,
      { name: "feature/foo" } as any,
    ];
    const api = fakeApi({
      getBranches: vi.fn().mockResolvedValue({
        branches,
        hasMore: false,
      }),
    });
    const result = await listBranches(api, { workspace: "acme", repo_slug: "r1" });
    expect(result.items).toHaveLength(3);
    expect(result.items[0].name).toBe("main");
    expect(result.items[2].name).toBe("feature/foo");
  });
});
