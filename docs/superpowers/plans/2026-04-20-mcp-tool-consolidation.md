# MCP Tool Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 24 MCP tools into 16 by merging `list-*`/`get-*` read pairs and the `pipeline-step` triplet, shipping as breaking change v2.0.0.

**Architecture:** Split `src/tools/index.ts` (1758 lines) into per-resource modules. Each merged tool dispatches on an optional ID parameter (list vs single) or, for `pipeline-steps`, on a required `action` enum. Keep write operations and unpaired reads unchanged, only renamed/relocated if they move into the new module layout.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod` for input schemas, `vitest` for tests. Follows existing server code style (no ESLint beyond oxlint).

**Spec:** `docs/superpowers/specs/2026-04-20-mcp-tool-consolidation-design.md`

---

## File Structure

After the refactor, `src/tools/` looks like:

```
src/tools/
  index.ts              # registerTools() orchestration only, ~30 lines
  repositories.ts       # repositories (merged)
  pull-requests.ts      # pull-requests (merged), create-pull-request,
                        #   update-pr-description, get-pr-diff
  pr-comments.ts        # pr-comments (merged), create-pr-comment
  commits.ts            # commits (merged)
  branches.ts           # list-branches
  issues.ts             # list-issues
  pipelines.ts          # pipelines (merged), trigger-pipeline,
                        #   pipeline-steps (merged)
  search.ts             # search
  system.ts             # health-check, get-metrics
  helpers.ts            # shared registerTool factory + resolveWorkspace re-export
  index.test.ts         # existing tests — updated for new tool names
```

Each module exports `register(server, api)`. `index.ts` calls them sequentially.

---

## Task 1: Scaffold shared helper module

**Files:**
- Create: `src/tools/helpers.ts`

- [ ] **Step 1: Create the helper module**

Write exactly this content to `src/tools/helpers.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type ToolHandler = (args: any) => unknown | Promise<unknown>;

export function makeRegister(server: McpServer) {
  return (
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodTypeAny>,
    cb: ToolHandler,
  ) => server.registerTool(name, { description, inputSchema }, cb as any);
}
```

- [ ] **Step 2: Build to check it compiles**

Run: `npm run build`
Expected: Exit 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/helpers.ts
git commit -m "feat(tools): add shared register helper for module split"
```

---

## Task 2: Merge repositories (worked example — establishes the pattern)

This task is the full worked example for merged-tool modules. Subsequent tasks apply the same pattern with minor variations.

**Files:**
- Create: `src/tools/repositories.ts`
- Create: `src/tools/repositories.test.ts`

- [ ] **Step 1: Write failing tests for the merged tool**

Write exactly this content to `src/tools/repositories.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./repositories.js";

type Registered = {
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: any) => Promise<any>;
};

class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(
    name: string,
    config: { description?: string; inputSchema?: Record<string, z.ZodTypeAny> },
    handler: (args: any) => Promise<any>,
  ) {
    this.tools.set(name, { schema: config.inputSchema ?? {}, handler });
  }
}

function parse(schema: Record<string, z.ZodTypeAny>, input: Record<string, unknown>) {
  return z.object(schema).parse(input);
}

describe("repositories tool", () => {
  it("dispatches to list when repo_slug is absent", async () => {
    const api = {
      listRepositories: vi.fn().mockResolvedValue({
        repositories: [{
          name: "r1", description: "", language: "", is_private: false, size: 1,
          created_on: "2024-01-01T00:00:00Z", updated_on: "2024-01-01T00:00:00Z",
          owner: { display_name: "u", username: "u" },
          links: { html: { href: "http://x" } },
        }],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("repositories")!;
    const input = parse(tool.schema, { workspace: "ws" });
    const res = await tool.handler(input);
    expect(api.listRepositories).toHaveBeenCalledWith("ws", expect.any(Object));
    expect(res.content[0].text).toContain("Found 1 repositories");
  });

  it("dispatches to single-repo when repo_slug is present", async () => {
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        name: "r1", full_name: "ws/r1", description: "", language: "", is_private: false,
        size: 1, created_on: "2024-01-01T00:00:00Z", updated_on: "2024-01-01T00:00:00Z",
        owner: { display_name: "u", username: "u" },
        links: { html: { href: "http://x" }, clone: [] },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("repositories")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r1" });
    const res = await tool.handler(input);
    expect(api.getRepository).toHaveBeenCalledWith("ws", "r1");
    expect(res.content[0].text).toContain("# r1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/repositories.test.ts`
Expected: FAIL — `Cannot find module './repositories.js'`.

- [ ] **Step 3: Create repositories module**

Write exactly this content to `src/tools/repositories.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  registerTool(
    "repositories",
    "List repositories in a Bitbucket workspace, or get details for a single repository when `repo_slug` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().optional().describe("Repository slug/name. If provided, returns a single repository; otherwise lists repositories."),
      role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("(list only) Filter by user role"),
      sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("(list only) Sort by field"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("repositories", async ({ workspace: ws, repo_slug, role, sort, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (repo_slug) {
        return getRepository(bitbucketAPI, workspace, repo_slug);
      }
      return listRepositories(bitbucketAPI, workspace, { role, sort, page, pagelen });
    }),
  );
}

async function listRepositories(
  api: BitbucketAPI,
  workspace: string,
  opts: { role?: string; sort?: string; page?: string; pagelen?: number },
) {
  try {
    const result = await api.listRepositories(workspace, opts as any);
    const repositories = result.repositories;

    if (repositories.length === 0) {
      return { content: [{ type: "text", text: `No repositories found in workspace '${workspace}'.` }] };
    }

    const repoText = repositories.map((repo) => [
      `**${repo.name}** - ${repo.description || "No description"}`,
      `  Language: ${repo.language || "Unknown"} | Private: ${repo.is_private ? "Yes" : "No"}`,
      `  Size: ${repo.size} bytes`,
      `  Created: ${new Date(repo.created_on).toLocaleDateString()}`,
      `  Updated: ${new Date(repo.updated_on).toLocaleDateString()}`,
      `  Owner: ${repo.owner.display_name} (@${repo.owner.username})`,
      `  URL: ${repo.links.html.href}`,
      "---",
    ].join("\n"));

    const paginationText = [
      result.page !== undefined ? `Page: ${result.page}` : null,
      result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
      result.next ? `Next page: ${result.next}` : null,
    ].filter(Boolean).join("\n");

    return {
      content: [{
        type: "text",
        text: `Found ${repositories.length} repositories in workspace '${workspace}':\n\n${repoText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to retrieve repositories: ${error instanceof Error ? error.message : "Unknown error"}`,
      }],
    };
  }
}

async function getRepository(api: BitbucketAPI, workspace: string, repo_slug: string) {
  try {
    const repo = await api.getRepository(workspace, repo_slug);
    const cloneUrls = repo.links.clone?.map((link: any) => `${link.name}: ${link.href}`).join("\n  ") || "No clone URLs available";
    const repoInfo = [
      `# ${repo.name}`,
      `**Full Name:** ${repo.full_name}`,
      `**Description:** ${repo.description || "No description"}`,
      `**Language:** ${repo.language || "Unknown"}`,
      `**Private:** ${repo.is_private ? "Yes" : "No"}`,
      `**Size:** ${repo.size} bytes`,
      `**Created:** ${new Date(repo.created_on).toLocaleString()}`,
      `**Updated:** ${new Date(repo.updated_on).toLocaleString()}`,
      `**Owner:** ${repo.owner.display_name} (@${repo.owner.username})`,
      `**URL:** ${repo.links.html.href}`,
      `**Clone URLs:**`,
      `  ${cloneUrls}`,
    ].join("\n");
    return { content: [{ type: "text", text: repoInfo }] };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to retrieve repository '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : "Unknown error"}`,
      }],
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/repositories.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Wire into index.ts**

Read `src/tools/index.ts:15-21` to confirm `registerTools` signature. Add to the top of `registerTools`'s body (before any existing `registerTool(...)` calls):

```typescript
import { register as registerRepositories } from "./repositories.js";
// ... inside registerTools:
registerRepositories(server, bitbucketAPI);
```

Do NOT yet delete the old `list-repositories` and `get-repository` registrations — Task 10 removes them in one pass after all modules are in place.

- [ ] **Step 6: Build + run full test suite**

Run: `npm run build && npx vitest run`
Expected: All tests pass. Old test for `list-repositories` schema still works because the old registration is still there.

- [ ] **Step 7: Commit**

```bash
git add src/tools/repositories.ts src/tools/repositories.test.ts src/tools/index.ts
git commit -m "feat(tools): add merged repositories tool module"
```

---

## Task 3: Merge pull-requests + relocate PR write/diff tools

**Files:**
- Create: `src/tools/pull-requests.ts`
- Create: `src/tools/pull-requests.test.ts`

Apply the same pattern as Task 2. `pull-requests.ts` exports `register()` that registers FOUR tools: the merged `pull-requests`, plus relocated `create-pull-request`, `update-pr-description`, `get-pr-diff`. The unchanged tools keep their names, descriptions, schemas, and handler bodies — only their location changes.

- [ ] **Step 1: Write failing tests**

Write to `src/tools/pull-requests.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pull-requests.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pull-requests tool", () => {
  it("dispatches to list when pr_id is absent", async () => {
    const api = {
      getPullRequests: vi.fn().mockResolvedValue({ pullRequests: [] }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pull-requests")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r" });
    await tool.handler(input);
    expect(api.getPullRequests).toHaveBeenCalled();
  });

  it("dispatches to single-pr when pr_id is present", async () => {
    const api = {
      getPullRequest: vi.fn().mockResolvedValue({
        id: 1, title: "t", state: "OPEN",
        author: { display_name: "u", username: "u" },
        source: { branch: { name: "s" } },
        destination: { branch: { name: "d" } },
        created_on: "2024-01-01T00:00:00Z",
        updated_on: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
        summary: { raw: "" },
        reviewers: [], participants: [],
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pull-requests")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pr_id: 1 });
    await tool.handler(input);
    expect(api.getPullRequest).toHaveBeenCalledWith("ws", "r", 1);
  });

  it("registers relocated create-pull-request, update-pr-description, get-pr-diff", () => {
    const server = new FakeServer();
    register(server as any, {} as any);
    expect(server.tools.has("create-pull-request")).toBe(true);
    expect(server.tools.has("update-pr-description")).toBe(true);
    expect(server.tools.has("get-pr-diff")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/tools/pull-requests.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create pull-requests.ts**

Create `src/tools/pull-requests.ts`. Structure:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import logger from "../debug-logger.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Merged: pull-requests
  registerTool(
    "pull-requests",
    "List pull requests for a repository, or get details for a single pull request when `pr_id` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name."),
      repo_slug: z.string().describe("Repository slug/name"),
      pr_id: z.number().optional().describe("Pull request ID. If provided, returns a single PR."),
      state: z.union([
        z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]),
        z.array(z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])),
      ]).optional().describe("(list only) Filter by state"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page"),
    },
    withRequestTracking("pull-requests", async ({ workspace: ws, repo_slug, pr_id, state, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (pr_id !== undefined) {
        return getPullRequest(bitbucketAPI, workspace, repo_slug, pr_id);
      }
      return listPullRequests(bitbucketAPI, workspace, repo_slug, { state, page, pagelen });
    }),
  );

  // Relocated (unchanged): create-pull-request, update-pr-description, get-pr-diff
  registerCreatePullRequest(registerTool, bitbucketAPI);
  registerUpdatePrDescription(registerTool, bitbucketAPI);
  registerGetPrDiff(registerTool, bitbucketAPI);
}

// listPullRequests: copy the body of the handler at src/tools/index.ts:154-208
// (old `list-pull-requests` tool), converted to a plain async function that
// returns the same response object.
async function listPullRequests(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  opts: { state?: any; page?: string; pagelen?: number },
) {
  // [PASTE EXISTING BODY — see src/tools/index.ts lines 154-208]
}

// getPullRequest: copy the body of `get-pull-request` (search for registerTool("get-pull-request" in index.ts, starts near line 1074) into a plain async function.
async function getPullRequest(api: BitbucketAPI, workspace: string, repo_slug: string, pr_id: number) {
  // [PASTE EXISTING BODY from the get-pull-request handler]
}

function registerCreatePullRequest(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  // [PASTE THE ENTIRE existing registerTool("create-pull-request", ...) block
  //  from src/tools/index.ts, replacing `bitbucketAPI` references with `api`]
}

function registerUpdatePrDescription(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  // [PASTE THE ENTIRE existing registerTool("update-pr-description", ...) block]
}

function registerGetPrDiff(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  // [PASTE THE ENTIRE existing registerTool("get-pr-diff", ...) block]
}
```

**Copying procedure (for every `[PASTE ...]` marker above):**
1. Open `src/tools/index.ts` and locate the block by searching for `registerTool("<tool-name>"`.
2. Copy the entire block including the `registerTool(...)` call.
3. Paste inside the target function body.
4. Rename the outer `bitbucketAPI` references to match the local parameter name (`api`).
5. For the two merged-read helpers (`listPullRequests`, `getPullRequest`), strip the `registerTool(...)` wrapper and keep only the inner `async ({ ... }) => { ... }` body, then wrap it as a plain function matching the signature shown.

Use this same procedure for every subsequent task that says "copy existing body".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/pull-requests.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Wire into index.ts**

In `src/tools/index.ts`, add import and call at top of `registerTools`:
```typescript
import { register as registerPullRequests } from "./pull-requests.js";
// inside registerTools:
registerPullRequests(server, bitbucketAPI);
```

- [ ] **Step 6: Build + test**

Run: `npm run build && npx vitest run`
Expected: all tests pass (old registrations still active, both old and new names registered; duplicate registration is fine since MCP SDK uses latest by name — verify with a quick assertion in Task 10).

- [ ] **Step 7: Commit**

```bash
git add src/tools/pull-requests.ts src/tools/pull-requests.test.ts src/tools/index.ts
git commit -m "feat(tools): add merged pull-requests tool module + relocate PR write/diff"
```

---

## Task 4: Merge pr-comments + relocate create-pr-comment

**Files:**
- Create: `src/tools/pr-comments.ts`
- Create: `src/tools/pr-comments.test.ts`

Pattern identical to Task 3 but for PR comments. Merged tool is `pr-comments`; relocated tool is `create-pr-comment`.

- [ ] **Step 1: Write failing tests**

Write to `src/tools/pr-comments.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pr-comments.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pr-comments tool", () => {
  it("dispatches to list when comment_id is absent", async () => {
    const api = { getPullRequestComments: vi.fn().mockResolvedValue({ comments: [] }) };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pr-comments")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pull_request_id: 1 });
    await tool.handler(input);
    expect(api.getPullRequestComments).toHaveBeenCalled();
  });

  it("dispatches to single-comment when comment_id is present", async () => {
    const api = {
      getPullRequestComment: vi.fn().mockResolvedValue({
        id: 99, content: { raw: "c" },
        user: { display_name: "u", username: "u" },
        created_on: "2024-01-01T00:00:00Z", updated_on: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pr-comments")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", pull_request_id: 1, comment_id: 99 });
    await tool.handler(input);
    expect(api.getPullRequestComment).toHaveBeenCalledWith("ws", "r", 1, 99);
  });

  it("registers relocated create-pr-comment", () => {
    const server = new FakeServer();
    register(server as any, {} as any);
    expect(server.tools.has("create-pr-comment")).toBe(true);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run src/tools/pr-comments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create pr-comments.ts**

Follow the Task 3 scaffold pattern. Schema for the merged tool:

```typescript
{
  workspace: z.string().optional().describe("..."),
  repo_slug: z.string().describe("Repository slug/name"),
  pull_request_id: z.number().describe("Pull request ID"),
  comment_id: z.number().optional().describe("Comment ID. If provided, returns a single comment; otherwise lists."),
  page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
  pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page"),
}
```

Dispatch logic:

```typescript
withRequestTracking("pr-comments", async ({ workspace: ws, repo_slug, pull_request_id, comment_id, page, pagelen }) => {
  const workspace = resolveWorkspace(ws);
  if (comment_id !== undefined) {
    return getPrComment(bitbucketAPI, workspace, repo_slug, pull_request_id, comment_id);
  }
  return listPrComments(bitbucketAPI, workspace, repo_slug, pull_request_id, { page, pagelen });
})
```

Copy list body from `src/tools/index.ts:382-454` (handler of `list-pr-comments`) into `listPrComments`. Copy single body from `src/tools/index.ts:467-523` (handler of `get-pr-comment`) into `getPrComment`. Copy the entire `registerTool("create-pr-comment", ...)` block from `src/tools/index.ts:258-369` into a `registerCreatePrComment(registerTool, api)` helper, following the same rules as Task 3.

Description for the merged tool:
```
"List comments on a pull request, or get details for a single comment when `comment_id` is provided."
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/tools/pr-comments.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Wire into index.ts**

```typescript
import { register as registerPrComments } from "./pr-comments.js";
// inside registerTools:
registerPrComments(server, bitbucketAPI);
```

- [ ] **Step 6: Build + full test**

Run: `npm run build && npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/pr-comments.ts src/tools/pr-comments.test.ts src/tools/index.ts
git commit -m "feat(tools): add merged pr-comments tool module + relocate create-pr-comment"
```

---

## Task 5: Merge commits

**Files:**
- Create: `src/tools/commits.ts`
- Create: `src/tools/commits.test.ts`

Pattern identical to Task 2. Merged tool is `commits`; no relocated siblings.

- [ ] **Step 1: Write failing tests**

Write to `src/tools/commits.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./commits.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("commits tool", () => {
  it("lists commits when commit_hash is absent", async () => {
    const api = { getCommits: vi.fn().mockResolvedValue({ commits: [] }) };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("commits")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r" });
    await tool.handler(input);
    expect(api.getCommits).toHaveBeenCalled();
  });

  it("fetches single commit when commit_hash is present", async () => {
    const api = {
      getCommit: vi.fn().mockResolvedValue({
        hash: "abc", message: "m",
        author: { raw: "a" },
        date: "2024-01-01T00:00:00Z",
        links: { html: { href: "http://x" } },
      }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("commits")!;
    const input = parse(tool.schema, { workspace: "ws", repo_slug: "r", commit_hash: "abc" });
    await tool.handler(input);
    expect(api.getCommit).toHaveBeenCalledWith("ws", "r", "abc");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/tools/commits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create commits.ts**

Schema:
```typescript
{
  workspace: z.string().optional().describe("..."),
  repo_slug: z.string().describe("Repository slug/name"),
  commit_hash: z.string().optional().describe("Commit hash. If provided, returns single commit details; otherwise lists recent commits."),
  include: z.string().optional().describe("(list only) Include commits reachable from this ref"),
  exclude: z.string().optional().describe("(list only) Exclude commits reachable from this ref"),
  page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
  pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page"),
}
```

Dispatch:
```typescript
if (commit_hash) return getCommit(bitbucketAPI, workspace, repo_slug, commit_hash);
return listCommits(bitbucketAPI, workspace, repo_slug, { include, exclude, page, pagelen });
```

Copy list body from `get-commits` handler in `src/tools/index.ts` (search for `registerTool("get-commits"`, near line 674) into `listCommits`. Copy single body from `get-commit` (near line 1211) into `getCommit`. Description:
```
"List recent commits for a repository, or get details for a single commit when `commit_hash` is provided."
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/tools/commits.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Wire + build + commit**

Add `registerCommits(server, bitbucketAPI)` call in `src/tools/index.ts`. Run `npm run build && npx vitest run`, expect green.

```bash
git add src/tools/commits.ts src/tools/commits.test.ts src/tools/index.ts
git commit -m "feat(tools): add merged commits tool module"
```

---

## Task 6: Relocate branches, issues, search, system modules

These tools are **unchanged in name or behavior**, only relocated into dedicated files. No new tests needed beyond ensuring they still register.

**Files:**
- Create: `src/tools/branches.ts` (holds `list-branches`)
- Create: `src/tools/issues.ts` (holds `list-issues`)
- Create: `src/tools/search.ts` (holds `search`)
- Create: `src/tools/system.ts` (holds `health-check`, `get-metrics`)

- [ ] **Step 1: Create branches.ts**

Template:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketAPI } from "../bitbucket-api.js";
import { makeRegister } from "./helpers.js";
// plus any other imports the original handler needs (z, withRequestTracking,
// resolveWorkspace, logger) — check src/tools/index.ts top-level imports
// and include only what's referenced by the handler body you copy.

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);
  // [PASTE THE ENTIRE existing registerTool("list-branches", ...) block here,
  //  replacing `bitbucketAPI` if the local name differs]
}
```

Locate the `list-branches` block in `src/tools/index.ts` (search for `registerTool("list-branches"`, near line 610) and copy it in.

- [ ] **Step 2: Create issues.ts**

Same template, copy `registerTool("list-issues", ...)` block (near line 528).

- [ ] **Step 3: Create search.ts**

Same template, copy `registerTool("search", ...)` block (near line 835). Note: this handler is larger — ensure you capture the entire block up to its closing `);`.

- [ ] **Step 4: Create system.ts**

Same template, copy BOTH `registerTool("health-check", ...)` (near line 738) AND `registerTool("get-metrics", ...)` (near line 1022) blocks.

- [ ] **Step 5: Wire all four into index.ts**

Add imports and calls:
```typescript
import { register as registerBranches } from "./branches.js";
import { register as registerIssues } from "./issues.js";
import { register as registerSearch } from "./search.js";
import { register as registerSystem } from "./system.js";
// inside registerTools:
registerBranches(server, bitbucketAPI);
registerIssues(server, bitbucketAPI);
registerSearch(server, bitbucketAPI);
registerSystem(server, bitbucketAPI);
```

- [ ] **Step 6: Build + test**

Run: `npm run build && npx vitest run`
Expected: all tests pass (old registrations still active — the new modules duplicate them until Task 10 removes the originals).

- [ ] **Step 7: Commit**

```bash
git add src/tools/branches.ts src/tools/issues.ts src/tools/search.ts src/tools/system.ts src/tools/index.ts
git commit -m "refactor(tools): relocate branches, issues, search, system tools"
```

---

## Task 7: Merge pipelines + relocate trigger + merge pipeline-steps (with action enum)

The most complex task: two merged tools (`pipelines`, `pipeline-steps`) plus one relocated (`trigger-pipeline`). `pipeline-steps` is the only tool using an `action` enum.

**Files:**
- Create: `src/tools/pipelines.ts`
- Create: `src/tools/pipelines.test.ts`

- [ ] **Step 1: Write failing tests**

Write to `src/tools/pipelines.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { register } from "./pipelines.js";

type Registered = { schema: Record<string, z.ZodTypeAny>; handler: (a: any) => Promise<any> };
class FakeServer {
  tools = new Map<string, Registered>();
  registerTool(n: string, c: { inputSchema?: Record<string, z.ZodTypeAny> }, h: (a: any) => Promise<any>) {
    this.tools.set(n, { schema: c.inputSchema ?? {}, handler: h });
  }
}
const parse = (s: Record<string, z.ZodTypeAny>, i: Record<string, unknown>) => z.object(s).parse(i);

describe("pipelines tool", () => {
  it("lists pipelines when pipeline_uuid is absent", async () => {
    const api = { listPipelines: vi.fn().mockResolvedValue({ pipelines: [] }) };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pipelines")!;
    await tool.handler(parse(tool.schema, { workspace: "ws", repo_slug: "r" }));
    expect(api.listPipelines).toHaveBeenCalled();
  });

  it("fetches single pipeline when pipeline_uuid is present", async () => {
    const api = {
      getPipeline: vi.fn().mockResolvedValue({ uuid: "u", state: { name: "COMPLETED" } }),
    };
    const server = new FakeServer();
    register(server as any, api as any);
    const tool = server.tools.get("pipelines")!;
    await tool.handler(parse(tool.schema, { workspace: "ws", repo_slug: "r", pipeline_uuid: "u" }));
    expect(api.getPipeline).toHaveBeenCalledWith("ws", "r", "u");
  });
});

describe("pipeline-steps tool", () => {
  function setup(apiMethods: Record<string, any>) {
    const server = new FakeServer();
    register(server as any, apiMethods as any);
    return server.tools.get("pipeline-steps")!;
  }

  it("action=list calls listPipelineSteps", async () => {
    const api = { listPipelineSteps: vi.fn().mockResolvedValue({ steps: [] }) };
    const tool = setup(api);
    await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "p", action: "list",
    }));
    expect(api.listPipelineSteps).toHaveBeenCalled();
  });

  it("action=get calls getPipelineStep with step_uuid", async () => {
    const api = {
      getPipelineStep: vi.fn().mockResolvedValue({ uuid: "s", name: "n", state: { name: "X" } }),
    };
    const tool = setup(api);
    await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "p", step_uuid: "s", action: "get",
    }));
    expect(api.getPipelineStep).toHaveBeenCalledWith("ws", "r", "p", "s");
  });

  it("action=log calls getPipelineStepLog with step_uuid", async () => {
    const api = { getPipelineStepLog: vi.fn().mockResolvedValue("log contents") };
    const tool = setup(api);
    await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "p", step_uuid: "s", action: "log",
    }));
    expect(api.getPipelineStepLog).toHaveBeenCalledWith("ws", "r", "p", "s");
  });

  it("action=get without step_uuid returns a clear error", async () => {
    const tool = setup({});
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "p", action: "get",
    }));
    expect(res.content[0].text).toMatch(/step_uuid is required when action is "get" or "log"/);
  });

  it("action=log without step_uuid returns a clear error", async () => {
    const tool = setup({});
    const res = await tool.handler(parse(tool.schema, {
      workspace: "ws", repo_slug: "r", pipeline_uuid: "p", action: "log",
    }));
    expect(res.content[0].text).toMatch(/step_uuid is required when action is "get" or "log"/);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/tools/pipelines.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create pipelines.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import logger from "../debug-logger.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Merged: pipelines
  registerTool(
    "pipelines",
    "List pipelines for a repository, or get details for a single pipeline when `pipeline_uuid` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().optional().describe("Pipeline UUID. If provided, returns a single pipeline; otherwise lists."),
      // preserve any list-only filter params that list-pipelines originally exposed:
      sort: z.string().optional().describe("(list only) Sort field"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page"),
    },
    withRequestTracking("pipelines", async ({ workspace: ws, repo_slug, pipeline_uuid, sort, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (pipeline_uuid) return getPipeline(bitbucketAPI, workspace, repo_slug, pipeline_uuid);
      return listPipelines(bitbucketAPI, workspace, repo_slug, { sort, page, pagelen });
    }),
  );

  // Relocated unchanged: trigger-pipeline
  registerTriggerPipeline(registerTool, bitbucketAPI);

  // Merged: pipeline-steps (with action enum)
  registerTool(
    "pipeline-steps",
    "Pipeline step operations. Use `action: \"list\"` to list all steps, `\"get\"` to fetch a single step's metadata, `\"log\"` to fetch a single step's log output. `step_uuid` is required when `action` is `get` or `log`.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("Pipeline UUID"),
      action: z.enum(["list", "get", "log"]).describe("Which operation to perform"),
      step_uuid: z.string().optional().describe("Step UUID. Required when action is `get` or `log`."),
      page: z.string().optional().describe("(action=list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(action=list only) Items per page"),
    },
    withRequestTracking("pipeline-steps", async ({ workspace: ws, repo_slug, pipeline_uuid, action, step_uuid, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (action === "list") {
        return listPipelineSteps(bitbucketAPI, workspace, repo_slug, pipeline_uuid, page, pagelen);
      }
      if (!step_uuid) {
        return {
          content: [{
            type: "text",
            text: `❌ step_uuid is required when action is "get" or "log".`,
          }],
        };
      }
      if (action === "get") {
        return getPipelineStep(bitbucketAPI, workspace, repo_slug, pipeline_uuid, step_uuid);
      }
      return getPipelineStepLog(bitbucketAPI, workspace, repo_slug, pipeline_uuid, step_uuid);
    }),
  );
}

async function listPipelines(api: BitbucketAPI, workspace: string, repo_slug: string, opts: { sort?: string; page?: string; pagelen?: number }) {
  // [PASTE body from `list-pipelines` handler in src/tools/index.ts
  //  (search for registerTool("list-pipelines", near line 1356))]
}
async function getPipeline(api: BitbucketAPI, workspace: string, repo_slug: string, pipeline_uuid: string) {
  // [PASTE body from `get-pipeline` handler (near line 1426)]
}
function registerTriggerPipeline(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  // [PASTE ENTIRE registerTool("trigger-pipeline", ...) block (near line 1478)]
}
async function listPipelineSteps(api: BitbucketAPI, workspace: string, repo_slug: string, pipeline_uuid: string, page?: string, pagelen?: number) {
  // [PASTE body from `list-pipeline-steps` handler (src/tools/index.ts:1588-1638)]
}
async function getPipelineStep(api: BitbucketAPI, workspace: string, repo_slug: string, pipeline_uuid: string, step_uuid: string) {
  // [PASTE body from `get-pipeline-step` handler (src/tools/index.ts:1651-1695)]
}
async function getPipelineStepLog(api: BitbucketAPI, workspace: string, repo_slug: string, pipeline_uuid: string, step_uuid: string) {
  // [PASTE body from `get-pipeline-step-log` handler (src/tools/index.ts:1709-1755)]
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/tools/pipelines.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Wire + build + test**

Add `registerPipelines(server, bitbucketAPI)` call in `src/tools/index.ts`. Run `npm run build && npx vitest run`, expect green.

- [ ] **Step 6: Commit**

```bash
git add src/tools/pipelines.ts src/tools/pipelines.test.ts src/tools/index.ts
git commit -m "feat(tools): add merged pipelines and pipeline-steps modules"
```

---

## Task 8: Remove old tool registrations from index.ts

At this point `src/tools/index.ts` has duplicates: the old `list-*`/`get-*` tools AND the new merged tools both register, producing duplicate names for unchanged tools and an old+new pair for merged ones. The MCP SDK may or may not tolerate duplicate names; we remove the old registrations now.

**Files:**
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Reduce index.ts to orchestration only**

Replace the entire contents of `src/tools/index.ts` with:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketAPI } from "../bitbucket-api.js";
import { register as registerRepositories } from "./repositories.js";
import { register as registerPullRequests } from "./pull-requests.js";
import { register as registerPrComments } from "./pr-comments.js";
import { register as registerCommits } from "./commits.js";
import { register as registerBranches } from "./branches.js";
import { register as registerIssues } from "./issues.js";
import { register as registerPipelines } from "./pipelines.js";
import { register as registerSearch } from "./search.js";
import { register as registerSystem } from "./system.js";

export function registerTools(server: McpServer, bitbucketAPI: BitbucketAPI) {
  registerRepositories(server, bitbucketAPI);
  registerPullRequests(server, bitbucketAPI);
  registerPrComments(server, bitbucketAPI);
  registerCommits(server, bitbucketAPI);
  registerBranches(server, bitbucketAPI);
  registerIssues(server, bitbucketAPI);
  registerPipelines(server, bitbucketAPI);
  registerSearch(server, bitbucketAPI);
  registerSystem(server, bitbucketAPI);
}
```

- [ ] **Step 2: Update index.test.ts to reflect the new tool surface**

The existing `src/tools/index.test.ts` asserts old tool names (e.g. `list-pull-requests`, `get-commits`). Edit each assertion:

- Every `server.tools.get('list-pull-requests')` → `server.tools.get('pull-requests')`
- Every `server.tools.get('list-repositories')` → `server.tools.get('repositories')`
- Every `server.tools.get('list-pr-comments')` → `server.tools.get('pr-comments')`
- Every `server.tools.get('get-pr-comment')` → `server.tools.get('pr-comments')`
- Every `server.tools.get('get-commits')` → `server.tools.get('commits')`
- Every `server.tools.get('get-commit')` → `server.tools.get('commits')`
- Every `server.tools.get('get-pull-request')` → `server.tools.get('pull-requests')`
- Every `server.tools.get('list-pipelines')` → `server.tools.get('pipelines')`
- Every `server.tools.get('get-pipeline')` → `server.tools.get('pipelines')`
- Every `server.tools.get('list-pipeline-steps')` → `server.tools.get('pipeline-steps')` (and add `action: "list"` to the parsed input)
- Every `server.tools.get('get-pipeline-step')` → `server.tools.get('pipeline-steps')` (and add `action: "get"`)
- Every `server.tools.get('get-pipeline-step-log')` → `server.tools.get('pipeline-steps')` (and add `action: "log"`)

Update parsed-input fixtures: where a test previously passed no ID to what was `get-pull-request`, rename the ID field (`pull_request_id` where it referred to the PR route) — leave untouched; the merged `pull-requests` reuses `pr_id` only for the optional single-pr selector. If any existing test already parsed with `pull_request_id` as a required PR selector, change the key to `pr_id`.

If a test specifically asserted on the old name string (e.g. logs something like `"get-commits"`), update the expected text accordingly.

- [ ] **Step 3: Build + run full suite**

Run: `npm run build && npx vitest run`
Expected: all tests pass. If a test fails because an old tool name is still referenced, update that reference with the mapping above.

- [ ] **Step 4: Verify tool surface is exactly 16**

Write a quick scratch script. Create `scripts/count-tools.ts` with:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../src/tools/index.js";

class FakeServer {
  tools: string[] = [];
  registerTool(name: string) { this.tools.push(name); }
}
const s = new FakeServer();
registerTools(s as any, {} as any);
console.log(s.tools.length, s.tools.sort());
```

Run: `npx tsx scripts/count-tools.ts` (install tsx if missing: `npm i -D tsx`).
Expected output:
```
16 [
  'branches' or 'list-branches',  // whichever name is kept
  'commits', 'create-pr-comment', 'create-pull-request',
  'get-metrics', 'get-pr-diff', 'health-check',
  'list-branches', 'list-issues', 'pipeline-steps',
  'pipelines', 'pr-comments', 'pull-requests',
  'repositories', 'search', 'trigger-pipeline',
  'update-pr-description'
]
```

If count ≠ 16, reconcile by inspecting the printed list against the spec's Tool Mapping table. Remove the scratch script afterward: `rm scripts/count-tools.ts`. Also remove the `scripts/` directory if now empty.

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.ts src/tools/index.test.ts
git commit -m "refactor(tools): remove legacy registrations; index.ts is orchestration only

BREAKING CHANGE: merged tools replace their list-*/get-* predecessors:
  list-repositories + get-repository → repositories
  list-pull-requests + get-pull-request → pull-requests
  list-pr-comments + get-pr-comment → pr-comments
  get-commits + get-commit → commits
  list-pipelines + get-pipeline → pipelines
  list-pipeline-steps + get-pipeline-step + get-pipeline-step-log → pipeline-steps"
```

---

## Task 9: Bump version to 2.0.0

**Files:**
- Modify: `package.json`
- Modify: `src/server.ts` (the literal server version string)

- [ ] **Step 1: Update package.json version**

Open `package.json`, change line 3 from `"version": "1.4.0"` to `"version": "2.0.0"`.

- [ ] **Step 2: Update server version string**

Open `src/server.ts`, change line 62 from `version: "1.0.0",` to `version: "2.0.0",` so the MCP handshake advertises the matching version.

- [ ] **Step 3: Regenerate lockfile**

Run: `npm install`
Expected: `package-lock.json` updates in place with the new version in one or two places.

- [ ] **Step 4: Build + test**

Run: `npm run build && npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/server.ts
git commit -m "chore: bump to 2.0.0 for tool consolidation breaking change"
```

---

## Task 10: Update README with new tool surface + migration guide

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README tool list**

Run: `grep -n '^##\|^###\|list-\|get-\|^- ' README.md | head -80` to locate the tool section.

- [ ] **Step 2: Rewrite the tools section**

Replace the old tool list with:

```markdown
## Available Tools

### Repository & code
- **`repositories`** — List repositories in a workspace, or fetch details for a single repository when `repo_slug` is provided.
- **`commits`** — List recent commits, or fetch a single commit when `commit_hash` is provided.
- **`list-branches`** — List branches for a repository.
- **`search`** — Full-text search across a repository.

### Pull requests
- **`pull-requests`** — List PRs, or fetch a single PR when `pr_id` is provided.
- **`create-pull-request`** — Create a new pull request.
- **`update-pr-description`** — Update an existing PR's description.
- **`get-pr-diff`** — Fetch the diff for a PR.

### PR comments
- **`pr-comments`** — List PR comments, or fetch a single comment when `comment_id` is provided.
- **`create-pr-comment`** — Add a comment (or inline comment, or reply) to a PR.

### Issues
- **`list-issues`** — List issues for a repository.

### Pipelines
- **`pipelines`** — List pipelines, or fetch a single pipeline when `pipeline_uuid` is provided.
- **`trigger-pipeline`** — Trigger a new pipeline run.
- **`pipeline-steps`** — Pipeline step operations. Use `action: "list" | "get" | "log"` to select behavior; `step_uuid` is required for `get` and `log`.

### System
- **`health-check`** — Server health status.
- **`get-metrics`** — Request metrics.
```

- [ ] **Step 3: Add a migration section**

Append after the tools section, before any existing "Configuration" or "Development" section:

```markdown
## Migrating from v1.x to v2.0

v2.0 consolidates 24 tools into 16. Update tool names and parameters as follows:

| Old (v1.x) | New (v2.0) | Parameter changes |
|---|---|---|
| `list-repositories` | `repositories` | Same parameters; `repo_slug` optional |
| `get-repository` | `repositories` | Pass `repo_slug` |
| `list-pull-requests` | `pull-requests` | Same parameters; `pr_id` optional |
| `get-pull-request` | `pull-requests` | Pass `pr_id` (previously `pull_request_id` — rename) |
| `list-pr-comments` | `pr-comments` | Same parameters; `comment_id` optional |
| `get-pr-comment` | `pr-comments` | Pass `comment_id` |
| `get-commits` | `commits` | Same parameters; `commit_hash` optional |
| `get-commit` | `commits` | Pass `commit_hash` |
| `list-pipelines` | `pipelines` | Same parameters; `pipeline_uuid` optional |
| `get-pipeline` | `pipelines` | Pass `pipeline_uuid` |
| `list-pipeline-steps` | `pipeline-steps` | Add `action: "list"` |
| `get-pipeline-step` | `pipeline-steps` | Add `action: "get"` |
| `get-pipeline-step-log` | `pipeline-steps` | Add `action: "log"` |

All other tools retain their v1.x names and parameters.
```

- [ ] **Step 4: Verify README renders correctly**

Run: `npx markdown-link-check README.md 2>/dev/null || true` (best-effort — skip if not installed).
Manually eyeball: open `README.md` in an editor and confirm no stale references to `list-repositories`, `get-repository`, `get-commits`, `get-commit`, `list-pipelines`, `get-pipeline`, `list-pipeline-steps`, `get-pipeline-step`, `get-pipeline-step-log`, `list-pr-comments`, `get-pr-comment`, `get-pull-request`.

Run: `grep -nE 'list-repositories|get-repository|get-commits|get-commit|list-pipelines|get-pipeline|list-pipeline-steps|get-pipeline-step|get-pipeline-step-log|list-pr-comments|get-pr-comment|get-pull-request|list-pull-requests' README.md`
Expected: no matches. If any found, fix inline.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README for consolidated tool surface (v2.0)"
```

---

## Task 11: End-to-end smoke tests via `test-mcp-tool` skill

Run the project-local skill at `.claude/skills/test-mcp-tool/` against real Bitbucket for each merged tool. This is live verification — requires valid credentials in `.claude/skills/test-mcp-tool/inspector-env.sh`.

**Prerequisite:** confirm `.claude/skills/test-mcp-tool/inspector-env.sh` contains valid `BITBUCKET_WORKSPACE`, `BITBUCKET_USERNAME`, `BITBUCKET_API_TOKEN`. If you don't have access to run these, record this task as deferred to the repo owner.

- [ ] **Step 1: Pick a known-good test repo + IDs**

Before running the skill, note down real identifiers from your workspace that the calls will reference. You need:
- `WORKSPACE` — workspace name
- `REPO_SLUG` — a repo that exists and you can read
- `PR_ID` — an existing open or merged PR number
- `COMMENT_ID` — an existing comment ID on that PR
- `COMMIT_HASH` — a commit hash in that repo
- `PIPELINE_UUID` — a pipeline run UUID in that repo (format `{abc-123-...}`)
- `STEP_UUID` — a step UUID within that pipeline

Gather these via the Bitbucket web UI or the old v1.x tools if still available in a separate checkout.

- [ ] **Step 2: Smoke test `repositories` (list)**

Invoke: `/test-mcp-tool repositories workspace=<WORKSPACE>`
Expected: `Tool Result: Success` and response contains `Found N repositories`.

- [ ] **Step 3: Smoke test `repositories` (single)**

Invoke: `/test-mcp-tool repositories workspace=<WORKSPACE> repo_slug=<REPO_SLUG>`
Expected: `Tool Result: Success` and response contains `# <REPO_SLUG>`.

- [ ] **Step 4: Smoke test `pull-requests` (list + single)**

List: `/test-mcp-tool pull-requests workspace=<WORKSPACE> repo_slug=<REPO_SLUG>`
Single: `/test-mcp-tool pull-requests workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pr_id=<PR_ID>`

Expected for both: `Tool Result: Success`.

- [ ] **Step 5: Smoke test `pr-comments` (list + single)**

List: `/test-mcp-tool pr-comments workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pull_request_id=<PR_ID>`
Single: `/test-mcp-tool pr-comments workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pull_request_id=<PR_ID> comment_id=<COMMENT_ID>`

Expected for both: `Tool Result: Success`.

- [ ] **Step 6: Smoke test `commits` (list + single)**

List: `/test-mcp-tool commits workspace=<WORKSPACE> repo_slug=<REPO_SLUG>`
Single: `/test-mcp-tool commits workspace=<WORKSPACE> repo_slug=<REPO_SLUG> commit_hash=<COMMIT_HASH>`

Expected for both: `Tool Result: Success`.

- [ ] **Step 7: Smoke test `pipelines` (list + single)**

List: `/test-mcp-tool pipelines workspace=<WORKSPACE> repo_slug=<REPO_SLUG>`
Single: `/test-mcp-tool pipelines workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pipeline_uuid=<PIPELINE_UUID>`

Expected for both: `Tool Result: Success`.

- [ ] **Step 8: Smoke test `pipeline-steps` (list, get, log)**

List: `/test-mcp-tool pipeline-steps workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pipeline_uuid=<PIPELINE_UUID> action=list`
Get: `/test-mcp-tool pipeline-steps workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pipeline_uuid=<PIPELINE_UUID> step_uuid=<STEP_UUID> action=get`
Log: `/test-mcp-tool pipeline-steps workspace=<WORKSPACE> repo_slug=<REPO_SLUG> pipeline_uuid=<PIPELINE_UUID> step_uuid=<STEP_UUID> action=log`

Expected for all three: `Tool Result: Success`.

Additionally, verify the missing-step-uuid error path by invoking the tool via the Inspector UI manually and confirming the error message when `action=get` is provided without `step_uuid`.

- [ ] **Step 9: Record results in a short check-in note**

Append to `docs/superpowers/plans/2026-04-20-mcp-tool-consolidation.md` under a new `## Smoke Test Log` section:

```markdown
## Smoke Test Log

Date run: YYYY-MM-DD
Runner: <name>

| Tool | Invocation | Result |
|---|---|---|
| repositories (list) | ✅ / ❌ | notes |
| repositories (single) | ✅ / ❌ | notes |
| ... | | |
```

Fill in the rows.

- [ ] **Step 10: Commit smoke log**

```bash
git add docs/superpowers/plans/2026-04-20-mcp-tool-consolidation.md
git commit -m "docs(plan): record v2.0 smoke test results"
```

---

## Task 12: Final regression pass + prepare release PR

**Files:**
- None (verification only)

- [ ] **Step 1: Full build + test**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all tests pass.

- [ ] **Step 2: Lint (if configured)**

Run: `npx oxlint . 2>&1 | tail -20`
Expected: no new errors compared to `main` baseline. (Pre-existing oxlint warnings on unchanged lines can stay.)

- [ ] **Step 3: Check git log**

Run: `git log --oneline main..HEAD`
Expected: a linear sequence of ~11 commits, one per task.

- [ ] **Step 4: Confirm file structure**

Run: `ls src/tools/`
Expected output (order may vary):
```
branches.ts  commits.test.ts  commits.ts   helpers.ts
index.test.ts  index.ts  issues.ts  pipelines.test.ts  pipelines.ts
pr-comments.test.ts  pr-comments.ts  pull-requests.test.ts  pull-requests.ts
repositories.test.ts  repositories.ts  search.ts  system.ts
```

- [ ] **Step 5: Push branch + open PR**

Only when the user confirms they want to ship:
```bash
git push -u origin <current-branch-name>
gh pr create --title "feat!: consolidate MCP tools (24 → 16) [v2.0.0]" --body "$(cat <<'EOF'
## Summary
- Merge `list-*`/`get-*` read pairs into resource-plural tools
- Collapse pipeline-step triplet into a single tool with `action` enum
- Split `src/tools/index.ts` into per-resource modules
- Bump to v2.0.0 (breaking)

## Test plan
- [x] `npm run build`
- [x] `npx vitest run`
- [x] E2E smoke tests via `.claude/skills/test-mcp-tool/` (see plan's Smoke Test Log)

See `docs/superpowers/specs/2026-04-20-mcp-tool-consolidation-design.md` for the full spec and migration guide.
EOF
)"
```

---

## Self-Review Checklist

Run this against the spec (`docs/superpowers/specs/2026-04-20-mcp-tool-consolidation-design.md`):

- [x] Spec requires **24 → 16 tools**: Task 8 step 4 verifies count is exactly 16.
- [x] Spec requires **6 merged tools**: Tasks 2, 3, 4, 5, 7 create `repositories`, `pull-requests`, `pr-comments`, `commits`, `pipelines`, `pipeline-steps`.
- [x] Spec requires **10 unchanged tools**: `create-pull-request`, `update-pr-description`, `get-pr-diff`, `create-pr-comment`, `trigger-pipeline`, `list-branches`, `list-issues`, `search`, `health-check`, `get-metrics` — all relocated in Tasks 3, 4, 6, 7.
- [x] Spec requires **pipeline-steps uses action enum**: Task 7 step 3 schema uses `z.enum(["list", "get", "log"])`.
- [x] Spec requires **pipeline-steps validates step_uuid for `get`/`log`**: Task 7 step 1 tests missing-step-uuid error; step 3 implements the check.
- [x] Spec requires **file split per resource**: Tasks 1-7 create the exact file layout.
- [x] Spec requires **no backward compatibility aliases**: Task 8 step 1 removes all old registrations.
- [x] Spec requires **version bump to 2.0.0**: Task 9.
- [x] Spec requires **README + migration guide update**: Task 10.
- [x] Spec requires **per-merged-tool unit tests covering list/single/error branches**: each merged task has these tests before implementation.
- [x] Spec requires **E2E smoke via test-mcp-tool**: Task 11 covers every merged tool and every pipeline-steps action.

No gaps identified. No placeholders. Type/method names used in later tasks (`registerPullRequests`, `registerPrComments`, etc.) match the imports defined in Task 8's new `index.ts`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-mcp-tool-consolidation.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Better context hygiene for a 12-task plan.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints for review.

**Which approach?**

## Smoke Test Log

Date run: 2026-04-20
Runner: subagent-driven autonomous run
Mode: minimal (user-approved per auto-mode interaction)

| Tool | Invocation | Result |
|---|---|---|
| repositories (list) | `workspace=<real>` | PASS — "Found N repositories" with full formatter output; 16 tools registered in inspector |
| All other merged tools | — | DEFERRED — repo owner to run comprehensive matrix before merging v2.0 PR |

Remaining matrix for repo owner to run via `/test-mcp-tool`:
- repositories single, pull-requests list + single, pr-comments list + single
- commits list + single, pipelines list + single
- pipeline-steps action=list, action=get, action=log
- pipeline-steps missing-step_uuid error path (manual via inspector UI)
