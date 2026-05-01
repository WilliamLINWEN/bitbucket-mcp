import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCommitCommand } from "./commit.js";
import * as commitsCore from "../../core/commits.js";

describe("cli commit command", () => {
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

  it("`commit list -r r1` calls core with the right args", async () => {
    vi.spyOn(commitsCore, "listCommits").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildCommitCommand({ json: true, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    expect(commitsCore.listCommits).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      branch: undefined,
      page: undefined,
      pagelen: undefined,
    });
  });

  it("`commit list -r r1 --branch main --pagelen 20` passes options correctly", async () => {
    vi.spyOn(commitsCore, "listCommits").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildCommitCommand({ json: true, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1", "--branch", "main", "--pagelen", "20"], { from: "user" });
    expect(commitsCore.listCommits).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      branch: "main",
      page: undefined,
      pagelen: 20,
    });
  });

  it("`commit list -r r1` outputs commit rows in text mode", async () => {
    vi.spyOn(commitsCore, "listCommits").mockResolvedValue({
      items: [
        {
          hash: "abcdef0123456789",
          message: "fix: resolve login bug\n\nMore details",
          author: { raw: "Alice <alice@example.com>" },
          date: "2024-01-01T00:00:00Z",
          links: { html: { href: "https://bitbucket.org/ws/r1/commits/abcdef01" } },
        } as any,
      ],
      hasMore: false,
    });
    const cmd = buildCommitCommand({ json: false, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("abcdef01");
    expect(written).toContain("fix: resolve login bug");
  });

  it("`commit view <hash> -r r1` calls core getCommit with the right args", async () => {
    vi.spyOn(commitsCore, "getCommit").mockResolvedValue({
      hash: "abcdef0123456789",
      message: "fix something",
      author: { raw: "Alice <alice@example.com>" },
      date: "2024-01-01T00:00:00Z",
      parents: [],
      links: { html: { href: "https://bitbucket.org/ws/r1/commits/abcdef01" } },
    } as any);
    const cmd = buildCommitCommand({ json: true, pretty: false });
    await cmd.parseAsync(["view", "abcdef0123456789", "-r", "r1"], { from: "user" });
    expect(commitsCore.getCommit).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      commit_hash: "abcdef0123456789",
    });
  });

  it("`commit list -r r1` requires --repo", async () => {
    const cmd = buildCommitCommand({ json: true, pretty: false });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["list"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });
});
