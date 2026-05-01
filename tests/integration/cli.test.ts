import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(ROOT, "build/cli/index.js");
const NODE = process.execPath;

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Run the built `bb` CLI as a subprocess. Auth/workspace env vars must be set
 * explicitly per call so tests stay deterministic regardless of the host shell.
 * Pass `null` for an env key to inherit from the parent process.
 */
function runCli(args: string[], env: Record<string, string | undefined>): RunResult {
  const finalEnv: NodeJS.ProcessEnv = { ...process.env };
  // Always start from a known auth state; callers add what they want.
  delete finalEnv.BITBUCKET_USERNAME;
  delete finalEnv.BITBUCKET_APP_PASSWORD;
  delete finalEnv.BITBUCKET_API_TOKEN;
  delete finalEnv.BITBUCKET_WORKSPACE;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) finalEnv[k] = v;
  }
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], {
      env: finalEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString?.() ?? "",
      stderr: err.stderr?.toString?.() ?? "",
      status: typeof err.status === "number" ? err.status : -1,
    };
  }
}

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(
      `Built CLI binary not found at ${CLI}. Run 'npm run build' before 'npm run test:integration'.`,
    );
  }
});

describe("bb CLI integration — no auth, public 'atlassian' workspace", () => {
  it("--help prints usage and exits 0", () => {
    const r = runCli(["--help"], {});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage: bb");
    expect(r.stdout).toContain("repo");
    expect(r.stdout).toContain("--json");
  });

  it("--version prints a non-empty version and exits 0", () => {
    const r = runCli(["--version"], {});
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("`--json repo list` returns real repos against the public atlassian workspace", () => {
    const r = runCli(["--json", "repo", "list", "--pagelen", "10"], {
      BITBUCKET_WORKSPACE: "atlassian",
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items[0]).toHaveProperty("name");
    expect(parsed.items[0]).toHaveProperty("links.html.href");
  });

  it("`repo list` text mode returns at least one repo line", () => {
    const r = runCli(["repo", "list", "--pagelen", "10"], {
      BITBUCKET_WORKSPACE: "atlassian",
    });
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n").length).toBeGreaterThan(1);
  });

  it("`--json repo view <slug>` returns a single repo by slug", () => {
    const r = runCli(["--json", "repo", "view", "atlassian-event"], {
      BITBUCKET_WORKSPACE: "atlassian",
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // `name` is the display name (e.g. "Atlassian Event"); the slug lives in
    // the second segment of `full_name`.
    expect(parsed.full_name).toBe("atlassian/atlassian-event");
    expect(typeof parsed.name).toBe("string");
    expect(parsed.name.length).toBeGreaterThan(0);
  });

  it("missing workspace exits with code 1 (caller error)", () => {
    const r = runCli(["repo", "list"], {});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("workspace");
  });

  it("non-existent repo exits with code 2 (upstream 404)", () => {
    const r = runCli(["repo", "view", "nonexistent-repo-xyz-12345"], {
      BITBUCKET_WORKSPACE: "atlassian",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/404/);
  });

  it("invalid integer for --pagelen produces a CliError exit code 1", () => {
    const r = runCli(["repo", "list", "--pagelen", "not-a-number"], {
      BITBUCKET_WORKSPACE: "atlassian",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/integer|invalid/i);
  });
});

const HAS_CREDS = !!(
  process.env.BITBUCKET_API_TOKEN && process.env.BITBUCKET_WORKSPACE
);

describe.skipIf(!HAS_CREDS)(
  "bb CLI integration — authenticated read paths (gated on $BITBUCKET_API_TOKEN + $BITBUCKET_WORKSPACE)",
  () => {
    const auth = {
      BITBUCKET_USERNAME: process.env.BITBUCKET_USERNAME,
      BITBUCKET_API_TOKEN: process.env.BITBUCKET_API_TOKEN,
      BITBUCKET_WORKSPACE: process.env.BITBUCKET_WORKSPACE,
    };

    it("`auth status` reports authenticated and reachable", () => {
      const r = runCli(["--json", "auth", "status"], auth);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.reachable).toBe(true);
      expect(parsed.workspaceTested).toBe(auth.BITBUCKET_WORKSPACE);
      // username + apiToken → Basic header → "basic" label
      // apiToken alone → Bearer header → "token" label
      expect(["basic", "token"]).toContain(parsed.authMethod);
    });

    it("`repo list` returns repos in the configured workspace", () => {
      const r = runCli(["--json", "repo", "list", "--pagelen", "10"], auth);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(Array.isArray(parsed.items)).toBe(true);
      // We don't assert > 0 because the workspace might be empty,
      // but the call itself must succeed.
    });

    it("`pr list` against the first repo in the workspace returns pagination shape", () => {
      // Discover a repo to query.
      const repoR = runCli(
        ["--json", "repo", "list", "--pagelen", "10"],
        auth,
      );
      expect(repoR.status).toBe(0);
      const repos = JSON.parse(repoR.stdout).items;
      if (repos.length === 0) {
        // No repos in workspace; nothing to assert against.
        return;
      }
      const slug = repos[0].full_name.split("/")[1];
      const r = runCli(
        ["--json", "pr", "list", "-r", slug, "--pagelen", "10"],
        auth,
      );
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toHaveProperty("items");
      expect(parsed).toHaveProperty("hasMore");
      expect(Array.isArray(parsed.items)).toBe(true);
    });

    it("invalid api token results in 401 → exit 2", () => {
      const r = runCli(["repo", "view", "definitely-private-repo-xyz"], {
        ...auth,
        BITBUCKET_API_TOKEN: "obviously-invalid-token",
      });
      // 401 (auth fails) or 404 (repo not found) both map to exit 2 per
      // the classifier; either is correct upstream-error behavior.
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/401|404/);
    });
  },
);
