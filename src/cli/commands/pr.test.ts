import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPrCommand } from "./pr.js";
import * as prCore from "../../core/pull-requests.js";

describe("cli pr command", () => {
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

  it("`pr list -r r1 --state OPEN` calls core with the right args", async () => {
    vi.spyOn(prCore, "listPullRequests").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildPrCommand({ json: true });
    // `from: "user"` → user args only, no node/script entries.
    await cmd.parseAsync(["list", "-r", "r1", "--state", "OPEN"], { from: "user" });
    expect(prCore.listPullRequests).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", state: "OPEN",
      page: undefined, pagelen: undefined,
    });
  });

  it("`pr view 7 -r r1` resolves and prints PR details", async () => {
    vi.spyOn(prCore, "getPullRequest").mockResolvedValue({ id: 7, title: "T" } as any);
    const cmd = buildPrCommand({ json: true });
    await cmd.parseAsync(["view", "7", "-r", "r1"], { from: "user" });
    expect(prCore.getPullRequest).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pr_id: 7,
    });
  });

  it("`pr create` requires --title and --source", async () => {
    const cmd = buildPrCommand({ json: true });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["create", "-r", "r1"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });
});
