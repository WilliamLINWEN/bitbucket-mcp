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
    const cmd = buildPrCommand({ json: true, pretty: false });
    // `from: "user"` → user args only, no node/script entries.
    await cmd.parseAsync(["list", "-r", "r1", "--state", "OPEN"], { from: "user" });
    expect(prCore.listPullRequests).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", state: "OPEN",
      page: undefined, pagelen: undefined,
    });
  });

  it("`pr view 7 -r r1` resolves and prints PR details", async () => {
    vi.spyOn(prCore, "getPullRequest").mockResolvedValue({ id: 7, title: "T" } as any);
    const cmd = buildPrCommand({ json: true, pretty: false });
    await cmd.parseAsync(["view", "7", "-r", "r1"], { from: "user" });
    expect(prCore.getPullRequest).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pr_id: 7,
    });
  });

  it("`pr create` requires --title and --source", async () => {
    const cmd = buildPrCommand({ json: true, pretty: false });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["create", "-r", "r1"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });

  it("`pr comment list 7 -r r1` calls core with the right args", async () => {
    const prCommentsCore = await import("../../core/pr-comments.js");
    vi.spyOn(prCommentsCore, "listPrComments").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildPrCommand({ json: true, pretty: false });
    await cmd.parseAsync(["comment", "list", "7", "-r", "r1"], { from: "user" });
    expect(prCommentsCore.listPrComments).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
      page: undefined, pagelen: undefined,
    });
  });

  it("`pr comment create 7 -r r1 -m hi` posts a non-inline comment", async () => {
    const prCommentsCore = await import("../../core/pr-comments.js");
    vi.spyOn(prCommentsCore, "createPrComment").mockResolvedValue({
      id: 99, links: { html: { href: "u" } },
    } as any);
    const cmd = buildPrCommand({ json: true, pretty: false });
    await cmd.parseAsync(["comment", "create", "7", "-r", "r1", "-m", "hi"], { from: "user" });
    expect(prCommentsCore.createPrComment).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
      content: "hi", parent_id: undefined, inline: undefined,
    });
  });

  it("`pr list` in text mode appends next-page hint when result.next is set", async () => {
    const nextUrl = "https://api.bitbucket.org/2.0/example/pullrequests?page=xyz";
    vi.spyOn(prCore, "listPullRequests").mockResolvedValue({
      items: [{ id: 1, state: "OPEN", title: "My PR", links: { html: { href: "https://bitbucket.org/acme/r1/pull-requests/1" } } } as any],
      hasMore: true,
      next: nextUrl,
    });
    const cmd = buildPrCommand({ json: false, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    const written = (stdoutSpy.mock.calls as [string][]).map(([s]) => s).join("");
    expect(written).toContain(`next page: --page '${nextUrl}'`);
  });

  it("`pr comment create 7 -r r1 -m hi --file src/foo.ts --to 10` builds inline options", async () => {
    const prCommentsCore = await import("../../core/pr-comments.js");
    vi.spyOn(prCommentsCore, "createPrComment").mockResolvedValue({
      id: 100, links: { html: { href: "u" } },
    } as any);
    const cmd = buildPrCommand({ json: true, pretty: false });
    await cmd.parseAsync(
      ["comment", "create", "7", "-r", "r1", "-m", "hi", "--file", "src/foo.ts", "--to", "10"],
      { from: "user" },
    );
    expect(prCommentsCore.createPrComment).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme", repo_slug: "r1", pull_request_id: 7,
      content: "hi", parent_id: undefined,
      inline: { path: "src/foo.ts", from: undefined, to: 10 },
    });
  });
});
