import { describe, it, expect, vi } from "vitest";
import { listIssues } from "./issues.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

function makeIssue(id: number, kind: string, title: string) {
  return {
    id,
    title,
    state: "open",
    priority: "major",
    kind,
    created_on: "2024-01-01T00:00:00Z",
    updated_on: "2024-01-01T00:00:00Z",
    reporter: { display_name: "Alice", username: "alice" },
    links: { html: { href: `https://bitbucket.org/ws/repo/issues/${id}` } },
  } as any;
}

describe("core/issues", () => {
  it("listIssues returns all issues when no kind filter is applied", async () => {
    const issues = [
      makeIssue(1, "bug", "Login failure"),
      makeIssue(2, "enhancement", "Improve UX"),
      makeIssue(3, "task", "Update docs"),
    ];
    const api = fakeApi({
      getIssues: vi.fn().mockResolvedValue({
        issues,
        hasMore: false,
      }),
    });
    const result = await listIssues(api, { workspace: "acme", repo_slug: "r1" });
    expect(result.items).toHaveLength(3);
    expect(api.getIssues).toHaveBeenCalledWith("acme", "r1", undefined, undefined, undefined);
  });

  it("listIssues returns all issues unfiltered regardless of kind (kind filter is a caller concern)", async () => {
    const issues = [
      makeIssue(1, "bug", "Login failure"),
      makeIssue(2, "enhancement", "Improve UX"),
      makeIssue(3, "bug", "Crash on load"),
    ];
    const api = fakeApi({
      getIssues: vi.fn().mockResolvedValue({
        issues,
        hasMore: false,
      }),
    });
    // Even though the API call returns mixed kinds, core returns them all unfiltered
    const result = await listIssues(api, { workspace: "acme", repo_slug: "r1" });
    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.kind)).toEqual(["bug", "enhancement", "bug"]);
  });

  it("listIssues passes pagination params to the API and returns them", async () => {
    const api = fakeApi({
      getIssues: vi.fn().mockResolvedValue({
        issues: [makeIssue(1, "bug", "A bug")],
        page: 2,
        pagelen: 10,
        next: "https://next-page",
        hasMore: true,
      }),
    });
    const result = await listIssues(api, {
      workspace: "acme",
      repo_slug: "r1",
      state: "open",
      page: "2",
      pagelen: 10,
    });
    expect(result.page).toBe(2);
    expect(result.pagelen).toBe(10);
    expect(result.next).toBe("https://next-page");
    expect(result.hasMore).toBe(true);
    expect(api.getIssues).toHaveBeenCalledWith("acme", "r1", "open", "2", 10);
  });
});
