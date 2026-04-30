import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRepoCommand } from "./repo.js";
import * as repositoriesCore from "../../core/repositories.js";

describe("cli repo command", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.env.BITBUCKET_WORKSPACE = "acme";
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
    delete process.env.BITBUCKET_WORKSPACE;
  });

  it("`repo list` prints the core result as JSON when globals.json is true", async () => {
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [{ name: "r1" } as any],
      hasMore: false,
    });

    const cmd = buildRepoCommand({ json: true });
    // `from: "user"` means the array is user-arg-only — no node/script entries.
    await cmd.parseAsync(["list"], { from: "user" });

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(JSON.parse(output)).toEqual({
      items: [{ name: "r1" }],
      hasMore: false,
    });
  });

  it("`repo view <slug>` resolves slug to repository details", async () => {
    vi.spyOn(repositoriesCore, "getRepository").mockResolvedValue({
      name: "r1",
      full_name: "acme/r1",
    } as any);

    const cmd = buildRepoCommand({ json: true });
    await cmd.parseAsync(["view", "r1"], { from: "user" });

    expect(repositoriesCore.getRepository).toHaveBeenCalledWith(
      expect.anything(),
      { workspace: "acme", repo_slug: "r1" },
    );
  });
});
