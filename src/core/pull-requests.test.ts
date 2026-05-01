import { describe, it, expect, vi } from "vitest";
import {
  listPullRequests,
  getPullRequest,
  createPullRequest,
  updatePullRequest,
  getPullRequestDiff,
} from "./pull-requests.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

describe("core/pull-requests", () => {
  it("listPullRequests forwards filters and reshapes the result", async () => {
    const api = fakeApi({
      getPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [{ id: 1 }],
        page: 1,
        pagelen: 10,
        next: undefined,
        hasMore: false,
      }),
    });
    const result = await listPullRequests(api, {
      workspace: "acme",
      repo_slug: "r1",
      state: "OPEN",
    });
    expect(result.items).toEqual([{ id: 1 }]);
    expect(api.getPullRequests).toHaveBeenCalledWith(
      "acme", "r1", "OPEN", undefined, undefined,
    );
  });

  it("getPullRequest delegates to the API client", async () => {
    const api = fakeApi({
      getPullRequest: vi.fn().mockResolvedValue({ id: 7 }),
    });
    const pr = await getPullRequest(api, { workspace: "acme", repo_slug: "r1", pr_id: 7 });
    expect(pr).toEqual({ id: 7 });
  });

  it("createPullRequest forwards every documented field", async () => {
    const api = fakeApi({
      createPullRequest: vi.fn().mockResolvedValue({ id: 9 }),
    });
    await createPullRequest(api, {
      workspace: "acme", repo_slug: "r1",
      title: "T", source_branch: "src", destination_branch: "dst",
      description: "d", close_source_branch: true, reviewers: ["u"],
    });
    expect(api.createPullRequest).toHaveBeenCalledWith("acme", "r1", {
      title: "T", source_branch: "src", destination_branch: "dst",
      description: "d", close_source_branch: true, reviewers: ["u"],
    });
  });

  it("updatePullRequest sends only provided fields", async () => {
    const api = fakeApi({
      updatePullRequest: vi.fn().mockResolvedValue({ id: 9 }),
    });
    await updatePullRequest(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 9, title: "T",
    });
    expect(api.updatePullRequest).toHaveBeenCalledWith("acme", "r1", 9, { title: "T" });
  });

  it("updatePullRequest throws when neither title nor description is provided", async () => {
    const api = fakeApi({
      updatePullRequest: vi.fn(),
    });
    await expect(
      updatePullRequest(api, { workspace: "acme", repo_slug: "r1", pull_request_id: 9 }),
    ).rejects.toThrow("updatePullRequest requires at least one of `title` or `description`");
    expect(api.updatePullRequest).not.toHaveBeenCalled();
  });

  it("getPullRequestDiff returns the diff string in a typed envelope", async () => {
    const api = fakeApi({
      getPullRequestDiff: vi.fn().mockResolvedValue("diff --git ..."),
    });
    const result = await getPullRequestDiff(api, {
      workspace: "acme", repo_slug: "r1", pull_request_id: 9,
    });
    expect(result).toEqual({ diff: "diff --git ..." });
  });
});
