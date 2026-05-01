import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildIssueCommand } from "./issue.js";
import * as issuesCore from "../../core/issues.js";

describe("cli issue command", () => {
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

  it("`issue list -r r1` calls core with the right args", async () => {
    vi.spyOn(issuesCore, "listIssues").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildIssueCommand({ json: true });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    expect(issuesCore.listIssues).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      state: undefined,
      kind: undefined,
      page: undefined,
      pagelen: undefined,
    });
  });

  it("`issue list -r r1 --state open --kind bug` passes filters correctly", async () => {
    vi.spyOn(issuesCore, "listIssues").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildIssueCommand({ json: true });
    await cmd.parseAsync(["list", "-r", "r1", "--state", "open", "--kind", "bug"], { from: "user" });
    expect(issuesCore.listIssues).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      state: "open",
      kind: "bug",
      page: undefined,
      pagelen: undefined,
    });
  });

  it("`issue list -r r1` outputs issue rows in text mode", async () => {
    vi.spyOn(issuesCore, "listIssues").mockResolvedValue({
      items: [
        {
          id: 42,
          title: "Login fails",
          state: "open",
          priority: "major",
          kind: "bug",
          reporter: { display_name: "Alice", username: "alice" },
          created_on: "2024-01-01T00:00:00Z",
          updated_on: "2024-01-01T00:00:00Z",
          links: { html: { href: "https://bitbucket.org/ws/r1/issues/42" } },
        } as any,
      ],
      hasMore: false,
    });
    const cmd = buildIssueCommand({ json: false });
    await cmd.parseAsync(["list", "-r", "r1"], { from: "user" });
    const written = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("#42");
    expect(written).toContain("Login fails");
    expect(written).toContain("bug");
  });

  it("`issue list` requires --repo", async () => {
    const cmd = buildIssueCommand({ json: true });
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(["list"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });

  it("`issue list -r r1 --pagelen 20` passes pagelen as integer", async () => {
    vi.spyOn(issuesCore, "listIssues").mockResolvedValue({ items: [], hasMore: false });
    const cmd = buildIssueCommand({ json: true });
    await cmd.parseAsync(["list", "-r", "r1", "--pagelen", "20"], { from: "user" });
    expect(issuesCore.listIssues).toHaveBeenCalledWith(expect.anything(), {
      workspace: "acme",
      repo_slug: "r1",
      state: undefined,
      kind: undefined,
      page: undefined,
      pagelen: 20,
    });
  });
});
