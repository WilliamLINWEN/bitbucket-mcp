import { describe, it, expect, vi } from "vitest";
import { listRepositories, getRepository } from "./repositories.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

function fakeApi(overrides: Partial<BitbucketAPI> = {}): BitbucketAPI {
  return overrides as unknown as BitbucketAPI;
}

describe("core/repositories", () => {
  it("listRepositories returns plain paginated data", async () => {
    const api = fakeApi({
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [{ name: "r1" }],
        page: 1,
        pagelen: 10,
        next: "https://api.bitbucket.org/2.0/...?page=2",
        hasMore: true,
      }),
    });

    const result = await listRepositories(api, {
      workspace: "acme",
      pagelen: 10,
    });

    expect(result).toEqual({
      items: [{ name: "r1" }],
      page: 1,
      pagelen: 10,
      next: "https://api.bitbucket.org/2.0/...?page=2",
      hasMore: true,
    });
    expect(api.listRepositories).toHaveBeenCalledWith("acme", {
      role: undefined,
      sort: undefined,
      page: undefined,
      pagelen: 10,
    });
  });

  it("getRepository delegates to the API client", async () => {
    const api = fakeApi({
      getRepository: vi.fn().mockResolvedValue({ name: "r1" }),
    });

    const result = await getRepository(api, {
      workspace: "acme",
      repo_slug: "r1",
    });

    expect(result).toEqual({ name: "r1" });
    expect(api.getRepository).toHaveBeenCalledWith("acme", "r1");
  });

  it("listRepositories surfaces API errors unchanged", async () => {
    const api = fakeApi({
      listRepositories: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(
      listRepositories(api, { workspace: "acme" }),
    ).rejects.toThrow("boom");
  });
});
