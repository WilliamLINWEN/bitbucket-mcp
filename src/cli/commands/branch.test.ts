import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildBranchCommand } from "./branch.js";
import * as branchesCore from "../../core/branches.js";

describe("cli branch command", () => {
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

  it("`branch list -r r1` calls core with the right args", async () => {
    vi.spyOn(branchesCore, "listBranches").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildBranchCommand({ json: true, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    expect(branchesCore.listBranches).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      page: undefined,
      pagelen: undefined,
    });
  });

  it("`branch list -r r1 --pagelen 20` passes pagelen correctly", async () => {
    vi.spyOn(branchesCore, "listBranches").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildBranchCommand({ json: true, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1", "--pagelen", "20"], { from: "user" });
    expect(branchesCore.listBranches).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      page: undefined,
      pagelen: 20,
    });
  });

  it("`branch list -r r1` outputs branch rows in text mode", async () => {
    vi.spyOn(branchesCore, "listBranches").mockResolvedValue({
      items: [
        {
          name: "main",
          target: {
            hash: "abcdef0123456789",
            message: "initial commit",
            author: { raw: "Alice <alice@example.com>" },
            date: "2024-01-01T00:00:00Z",
            links: { html: { href: "https://bitbucket.org/ws/r1/commits/abcdef01" } },
          },
          links: { html: { href: "https://bitbucket.org/ws/r1/branch/main" } },
        } as any,
      ],
      hasMore: false,
    });
    const cmd = buildBranchCommand({ json: false, pretty: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("main");
    expect(written).toContain("abcdef01");
  });

  it("`branch list` requires --repo", async () => {
    const cmd = buildBranchCommand({ json: true, pretty: false });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["list"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });
});
