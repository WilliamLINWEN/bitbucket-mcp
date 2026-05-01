import { describe, it, expect, vi } from "vitest";
import {
  listPrComments,
  getPrComment,
  createPrComment,
} from "./pr-comments.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

describe("core/pr-comments", () => {
  it("listPrComments forwards pagination and reshapes comments → items", async () => {
    const api = fakeApi({
      getPullRequestComments: vi.fn().mockResolvedValue({
        comments: [{ id: 1 } as any],
        page: 1,
        pagelen: 10,
        next: undefined,
        hasMore: false,
      }),
    });
    const result = await listPrComments(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
    });
    expect(result.items).toEqual([{ id: 1 }]);
    expect(api.getPullRequestComments).toHaveBeenCalledWith(
      "acme", "r1", 7, { page: undefined, pagelen: undefined },
    );
  });

  it("getPrComment delegates to the API client", async () => {
    const api = fakeApi({
      getPullRequestComment: vi.fn().mockResolvedValue({ id: 5 }),
    });
    const result = await getPrComment(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7, comment_id: 5,
    });
    expect(result).toEqual({ id: 5 });
    expect(api.getPullRequestComment).toHaveBeenCalledWith("acme", "r1", 7, 5);
  });

  it("createPrComment forwards content and parent_id", async () => {
    const api = fakeApi({
      createPullRequestComment: vi.fn().mockResolvedValue({ id: 9 }),
    });
    await createPrComment(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
      content: "hi", parent_id: 5,
    });
    expect(api.createPullRequestComment).toHaveBeenCalledWith(
      "acme", "r1", 7, "hi", undefined, 5,
    );
  });

  it("createPrComment forwards inline options when present", async () => {
    const api = fakeApi({
      createPullRequestComment: vi.fn().mockResolvedValue({ id: 10 }),
    });
    await createPrComment(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
      content: "see this line",
      inline: { path: "src/foo.ts", to: 42 },
    });
    expect(api.createPullRequestComment).toHaveBeenCalledWith(
      "acme", "r1", 7, "see this line",
      { path: "src/foo.ts", to: 42 },
      undefined,
    );
  });
});
