# Bitbucket MCP Server
<img src="./images/logo.jpg" alt="Bitbucket MCP Logo" width="640" height="320">

[![npm version](https://img.shields.io/npm/v/bitbucket-mcp-server.svg)](https://www.npmjs.com/package/bitbucket-mcp-server)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-181717.svg?logo=github)](https://github.com/WilliamLINWEN/bitbucket-mcp)
[![CI](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/ci.yml)
[![Publish to npm](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/publish.yml)
[![CodeQL](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/WilliamLINWEN/bitbucket-mcp/actions/workflows/codeql.yml)

A Model Context Protocol (MCP) server that provides tools for interacting with Bitbucket repositories, pull requests, issues, and more.

## Safety

This server is **read-heavy and non-destructive** — no DELETE operations are used against the Bitbucket API, so there is no risk of accidental data loss. Write operations are limited to creating and updating resources (e.g., pull requests, comments, pipelines).

## Quick Start

### Using NPX (Recommended)

Run directly without cloning the repository:

```bash
BITBUCKET_USERNAME="your-email@example.com" \
BITBUCKET_API_TOKEN="your-api-token" \
npx -y bitbucket-mcp-server@latest
```

### From Source

1. **Install and Build:**
   ```bash
   npm install
   npm run build
   ```

2. **Configure Environment:**
   Set the required variables (see [Configuration](#configuration)):
   ```bash
   export BITBUCKET_API_TOKEN="your-api-token"
   export BITBUCKET_USERNAME="your-email@example.com"
   ```

3. **Run the Server:**
   ```bash
   npm start
   ```

## Features

This MCP server provides comprehensive tools for Bitbucket integration:

- **Repository Management**: List and inspect repositories in a workspace.
- **Pull Requests**: Full lifecycle support—list, get details, create, update, diff, and comment.
- **Issues**: Query and filter repository issues.
- **Source Code**: Explore branches and commits.
- **Pipelines**: List, get, and trigger Bitbucket pipelines for CI/CD.
- **System & Search**: Cross-resource search and health monitoring.

For a full list of available tools and their parameters, see the [Tool Reference](docs/TOOLS.md).

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

## Migrating from v1.x to v2.0

v2.0 consolidates 24 tools into 16. Update tool names and parameters as follows:

| Old (v1.x) | New (v2.0) | Parameter changes |
|---|---|---|
| `list-repositories` | `repositories` | Same parameters; `repo_slug` optional |
| `get-repository` | `repositories` | Pass `repo_slug` |
| `list-pull-requests` | `pull-requests` | Same parameters; `pr_id` optional |
| `get-pull-request` | `pull-requests` | Pass `pr_id` (previously `pull_request_id` — rename) |
| `list-pr-comments` | `pr-comments` | `pull_request_id` → `pr_id` (matches `pull-requests`); `comment_id` optional |
| `get-pr-comment` | `pr-comments` | `pull_request_id` → `pr_id`; pass `comment_id` |
| `get-commits` | `commits` | Same parameters; `commit_hash` optional |
| `get-commit` | `commits` | Pass `commit_hash` |
| `list-pipelines` | `pipelines` | Same parameters; `pipeline_uuid` optional |
| `get-pipeline` | `pipelines` | Pass `pipeline_uuid` |
| `list-pipeline-steps` | `pipeline-steps` | Add `action: "list"` |
| `get-pipeline-step` | `pipeline-steps` | Add `action: "get"` |
| `get-pipeline-step-log` | `pipeline-steps` | Add `action: "log"` |

All other tools retain their v1.x names and parameters.

## Installation

1. Clone or download this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

The server is configured via environment variables. For detailed setup instructions and client-specific examples (Claude Desktop, etc.), please refer to the [Configuration Guide](CONFIGURATION.md).

### Essential Variables

| Variable | Description |
|---|---|
| `BITBUCKET_API_TOKEN` | **(Required)** Your User API token or Workspace/Project token |
| `BITBUCKET_USERNAME` | **(Required for User API tokens)** Your Atlassian account email |
| `BITBUCKET_WORKSPACE` | Default workspace used when the parameter is omitted |

> **Note:** If you are using a Workspace or Project access token, you can omit `BITBUCKET_USERNAME`.

### Advanced Settings

Additional configuration options for timeouts, caching, metrics, and retries are documented in [CONFIGURATION.md](CONFIGURATION.md#optional-settings).

## MCP Client Configuration

Add this server to your MCP client configuration (e.g., `claude_desktop_config.json`). See [CONFIGURATION.md](CONFIGURATION.md#mcp-client-configuration) for full examples for macOS, Linux, and Windows.

**Using NPX (recommended):**
```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "npx",
      "args": ["-y", "bitbucket-mcp-server@latest"],
      "env": {
        "BITBUCKET_USERNAME": "your-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token",
        "BITBUCKET_WORKSPACE": "your-workspace"
      }
    }
  }
}
```

**Using local build:**
```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/bitbucket_mcp/build/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token",
        "BITBUCKET_WORKSPACE": "your-workspace"
      }
    }
  }
}
```

## Usage Examples

### List Repositories
```text
List all repositories in the 'myworkspace' workspace
```

### Create Pull Request
```text
Create a pull request from feature/my-feature to main in myworkspace/myrepo with title "My Feature PR"
```

### Search Workspace
```text
Search for "authentication" across all repositories and pull requests
```

See more examples for PRs, issues, and commits in the [Tool Reference](docs/TOOLS.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19.x or >= 22.12.0
- npm (included with Node.js)

## Development

- **Build**: `npm run build`
- **Dev Mode**: `npm run dev`
- **Test**: `npm test`
- **Coverage**: `npm run test:coverage`

## Troubleshooting

Refer to the [Troubleshooting section in CONFIGURATION.md](CONFIGURATION.md#troubleshooting) for common issues related to authentication, permissions, and rate limiting.

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Links

- [npm Package](https://www.npmjs.com/package/bitbucket-mcp-server)
- [GitHub Repository](https://github.com/WilliamLINWEN/bitbucket-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Bitbucket REST API Documentation](https://developer.atlassian.com/cloud/bitbucket/rest/intro/)
- [Bitbucket Cloud Documentation](https://support.atlassian.com/bitbucket-cloud/)
