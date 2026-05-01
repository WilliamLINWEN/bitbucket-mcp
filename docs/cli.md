# Bitbucket CLI (`bb`)

This document covers the `bb` command-line interface, a terminal-based companion to the MCP server. Both the MCP server and the CLI share the same underlying core logic via `core/`, ensuring consistency across interfaces.

## Installation

Install the package globally to expose both the MCP server and the CLI:

```bash
npm install -g bitbucket-mcp-server
```

This provides two binaries:
- `bitbucket-mcp` — the MCP server
- `bb` — the CLI

Verify the CLI is available:
```bash
bb --help
```

## Authentication

The CLI supports the following authentication methods, in order of preference:

### Recommended: API Token

Generate a personal API token at https://bitbucket.org/account/settings/api-tokens/:

```bash
export BITBUCKET_API_TOKEN="your-api-token"
bb auth status
```

### Legacy: Username + App Password

If using an app password instead of an API token:

```bash
export BITBUCKET_USERNAME="your-email@example.com"
export BITBUCKET_APP_PASSWORD="your-app-password"
bb auth status
```

### Public Operations

Public read-only operations (e.g., listing public repositories) do not require authentication.

### Check Status

To verify your authentication and connectivity:

```bash
bb auth status
```

Output (human-readable):
```
auth: token
workspace tested: myworkspace
reachable: yes
```

## Workspace Resolution

Most commands operate on a workspace. You can specify the workspace in two ways:

### Flag (Recommended)

Use the `--workspace` flag at the parent level (before the subcommand):

```bash
bb --workspace myworkspace pr list -r myrepo
```

### Environment Variable

Fall back to the `BITBUCKET_WORKSPACE` environment variable:

```bash
export BITBUCKET_WORKSPACE=myworkspace
bb pr list -r myrepo
```

If neither is provided, the command will fail with exit code 1.

## Output Format

### Human-Readable (Default)

By default, commands output formatted text suitable for terminals:

```bash
bb repo list
```

Output:
```
my-app          private   TypeScript  https://bitbucket.org/myworkspace/my-app
another-repo    public    Python      https://bitbucket.org/myworkspace/another-repo
```

### Machine-Readable JSON

Use the `--json` flag at the parent level (before the subcommand) to get JSON output. By default, JSON is compact (no whitespace) — suitable for piping to `jq` and other tools:

```bash
bb --json repo list
```

Output:
```
{"items":[{"name":"my-app","is_private":true,"language":"TypeScript","links":{"html":{"href":"https://bitbucket.org/myworkspace/my-app"}}}],"hasMore":false}
```

### Pretty-Printed JSON

Add `--pretty` alongside `--json` for human-readable multi-line JSON output:

```bash
bb --json --pretty repo list
```

Output:
```json
{
  "items": [
    {
      "name": "my-app",
      "is_private": true,
      "language": "TypeScript",
      "links": {"html": {"href": "https://bitbucket.org/myworkspace/my-app"}}
    }
  ]
}
```

**Note:** The `--json` and `--pretty` flags must come before the subcommand, not after.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Caller error (missing workspace, invalid arguments, missing/invalid credentials) |
| 2 | Upstream Bitbucket API error (4xx/5xx, auth failure, rate limit) |
| 3 | Unknown / internal error |

## Command Reference

### `bb repo`

Repository operations.

#### Subcommands

**`bb repo list [options]`**

List repositories in a workspace.

Options:
- `--role <role>` — Filter by user role: `owner`, `admin`, `contributor`, `member`
- `--sort <field>` — Sort by: `created_on`, `updated_on`, `name`, `size`
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace repo list
bb --workspace myworkspace repo list --role owner --sort updated_on
```

**`bb repo view <slug>`**

Show details for a single repository.

Examples:
```bash
bb --workspace myworkspace repo view my-app
```

### `bb pr`

Pull request operations.

#### Subcommands

**`bb pr list --repo <slug> [options]`**

List pull requests in a repository.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--state <state>` — Filter by state: `OPEN`, `MERGED`, `DECLINED`, `SUPERSEDED`
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace pr list -r my-app
bb --workspace myworkspace pr list -r my-app --state OPEN --pagelen 10
```

**`bb pr view <id> --repo <slug>`**

Show details for a single pull request.

Examples:
```bash
bb --workspace myworkspace pr view 42 -r my-app
```

**`bb pr create --repo <slug> --title <title> --source <branch> [options]`**

Create a new pull request.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--title <title>` — **(Required)** PR title
- `--source <branch>` — **(Required)** Source branch
- `--destination <branch>` — Destination branch (defaults to repo main)
- `--description <text>` — PR description (Markdown)
- `--close-source-branch` — Close source branch on merge
- `--reviewer <uuid...>` — Reviewer account UUIDs (repeatable)

Examples:
```bash
bb --workspace myworkspace pr create -r my-app -t "Add feature X" -s feature-x
bb --workspace myworkspace pr create -r my-app -t "Add feature X" -s feature-x -d main --reviewer uuid1 --reviewer uuid2
```

**`bb pr edit <id> --repo <slug> [options]`**

Update PR title and/or description.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--title <title>` — New title
- `--description <text>` — New description

Examples:
```bash
bb --workspace myworkspace pr edit 42 -r my-app --title "Updated title"
```

**`bb pr diff <id> --repo <slug>`**

Print the unified diff for a pull request.

Examples:
```bash
bb --workspace myworkspace pr diff 42 -r my-app
```

#### PR Comments

**`bb pr comment list <id> --repo <slug> [options]`**

List comments on a pull request.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace pr comment list 42 -r my-app
```

**`bb pr comment create <id> --repo <slug> --message <text> [options]`**

Create a comment on a pull request (optionally inline or as a reply).

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--message <text>` — **(Required)** Comment text
- `--parent <commentId>` — Reply to a comment (comment ID)
- `--file <path>` — Inline comment: file path
- `--from <line>` — Inline comment: old-version line number
- `--to <line>` — Inline comment: new-version line number

Examples:
```bash
bb --workspace myworkspace pr comment create 42 -r my-app -m "Looks good!"
bb --workspace myworkspace pr comment create 42 -r my-app -m "Not quite..." --parent 123
```

### `bb commit`

Commit operations.

#### Subcommands

**`bb commit list --repo <slug> [options]`**

List recent commits for a repository.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--branch <name>` — Branch name (defaults to main branch)
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace commit list -r my-app
bb --workspace myworkspace commit list -r my-app --branch develop
```

**`bb commit view <hash> --repo <slug>`**

Show details for a single commit.

Examples:
```bash
bb --workspace myworkspace commit view abc1234 -r my-app
```

### `bb branch`

Branch operations.

#### Subcommands

**`bb branch list --repo <slug> [options]`**

List branches for a repository.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace branch list -r my-app
```

### `bb issue`

Issue operations.

#### Subcommands

**`bb issue list --repo <slug> [options]`**

List issues for a repository.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--state <state>` — Filter by state: `new`, `open`, `resolved`, `on hold`, `invalid`, `duplicate`, `wontfix`, `closed`
- `--kind <kind>` — Filter by kind: `bug`, `enhancement`, `proposal`, `task`
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace issue list -r my-app
bb --workspace myworkspace issue list -r my-app --state open --kind bug
```

### `bb pipeline`

Pipeline operations for CI/CD.

#### Subcommands

**`bb pipeline list --repo <slug> [options]`**

List pipelines for a repository.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace pipeline list -r my-app
```

**`bb pipeline view <uuid> --repo <slug>`**

Show details for a single pipeline.

Examples:
```bash
bb --workspace myworkspace pipeline view abc-def-ghi -r my-app
```

**`bb pipeline trigger --repo <slug> [options]`**

Trigger a new pipeline.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--branch <name>` — Branch ref to trigger on
- `--tag <name>` — Tag ref to trigger on
- `--commit <hash>` — Commit hash to trigger on
- `--selector-type <type>` — Selector type (e.g., `custom`)
- `--selector-pattern <pattern>` — Selector pattern
- `--var <key=value>` — Pipeline variable (repeatable)

Examples:
```bash
bb --workspace myworkspace pipeline trigger -r my-app --branch main
bb --workspace myworkspace pipeline trigger -r my-app --commit abc1234 --var KEY=value
```

#### Pipeline Steps

**`bb pipeline step list <pipelineUuid> --repo <slug> [options]`**

List steps for a pipeline.

Options:
- `--repo <slug>` — **(Required)** Repository slug
- `--page <page>` — Page number or opaque next-page URL
- `--pagelen <n>` — Items per page (10–100, default 25)

Examples:
```bash
bb --workspace myworkspace pipeline step list abc-def-ghi -r my-app
```

**`bb pipeline step view <pipelineUuid> <stepUuid> --repo <slug>`**

Show details for a single pipeline step.

Examples:
```bash
bb --workspace myworkspace pipeline step view abc-def-ghi step-xyz -r my-app
```

**`bb pipeline step log <pipelineUuid> <stepUuid> --repo <slug>`**

Print the log for a pipeline step.

Examples:
```bash
bb --workspace myworkspace pipeline step log abc-def-ghi step-xyz -r my-app
```

### `bb search`

Full-text search across repositories, pull requests, issues, and commits.

#### Subcommands

**`bb search <query> [options]`**

Search across multiple resource types.

Options:
- `--types <list>` — Comma-separated types: `repositories`, `pull-requests`, `issues`, `commits` (default: `repositories,pull-requests,issues`)
- `--limit <n>` — Max results per type (1–50, default 10)

Examples:
```bash
bb --workspace myworkspace search "authentication"
bb --workspace myworkspace search "bug fix" --types issues,pull-requests --limit 20
```

### `bb auth`

Authentication operations.

#### Subcommands

**`bb auth status`**

Show authentication status and connectivity to Bitbucket.

Examples:
```bash
bb auth status
```

**`bb auth login`**

Display instructions for setting up authentication.

Examples:
```bash
bb auth login
```

**`bb auth logout`**

Display instructions for clearing authentication.

Examples:
```bash
bb auth logout
```

## Worked Example

List the 10 most recent open pull requests for the `acme/api` repository and export as JSON:

```bash
BITBUCKET_WORKSPACE=acme bb --json pr list -r api --state OPEN --pagelen 10
```

This command:
1. Sets the workspace to `acme` via environment variable
2. Uses `--json` to output machine-readable JSON
3. Lists PRs in the `api` repository
4. Filters to only `OPEN` state
5. Returns at most 10 results

Sample JSON output:
```json
{
  "items": [
    {
      "id": 123,
      "title": "Add OAuth support",
      "state": "OPEN",
      "links": {"html": {"href": "https://bitbucket.org/acme/api/pull-requests/123"}}
    },
    {
      "id": 122,
      "title": "Fix memory leak",
      "state": "OPEN",
      "links": {"html": {"href": "https://bitbucket.org/acme/api/pull-requests/122"}}
    }
  ]
}
```

## Tips & Tricks

- **Pagination**: Commands that return paginated results include a `next` field in JSON mode. Use that opaque URL as `--page` to fetch the next batch.
- **Piping**: Human-readable output is tab-separated or newline-delimited, making it easy to pipe into `grep`, `awk`, or `sort`.
- **Batch operations**: Combine `--json` with `jq` for scripted workflows:
  ```bash
  bb --workspace myworkspace --json repo list | jq '.items[] | .name'
  ```
- **Error handling**: Use exit codes in scripts to detect failures.
