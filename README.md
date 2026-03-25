# Bitbucket MCP Server
<img src="./images/logo.jpg" alt="Bitbucket MCP Logo" width="640" height="320">


A Model Context Protocol (MCP) server that provides tools for interacting with Bitbucket repositories, pull requests, issues, and more.

## Features

This MCP server provides the following tools for Bitbucket integration:

### Repository Management
- **list-repositories**: List repositories in a Bitbucket workspace
- **get-repository**: Get detailed information about a specific repository

### Pull Requests
- **list-pull-requests**: List pull requests for a repository with filtering options
- **get-pull-request**: Get detailed information about a specific pull request
- **create-pull-request**: Create a new pull request in a repository
- **update-pr-description**: Update the title and/or description of an existing pull request
- **get-pr-diff**: Get the diff/changes of a specific pull request
- **create-pr-comment**: Create a comment or inline comment on a pull request
- **list-pr-comments**: List all comments on a pull request, including inline comments and replies
- **get-pr-comment**: Get detailed information about a specific comment on a pull request

### Issues
- **list-issues**: List issues for a repository with state and kind filtering

### Source Code
- **list-branches**: List all branches in a repository
- **get-commits**: Get recent commits with optional branch filtering
- **get-commit**: Get detailed information about a specific commit

### System & Search
- **search**: Search across repositories, pull requests, issues, and commits in a workspace
- **health-check**: Check connectivity to Bitbucket API and validate credentials
- **get-metrics**: Get server performance metrics and statistics

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

#### Authentication

| Variable | Description |
|---|---|
| `BITBUCKET_API_TOKEN` | **(Required)** Your User API token or Workspace/Project token |
| `BITBUCKET_USERNAME` | **(Required for User API tokens)** Your Atlassian account email |
| `BITBUCKET_APP_PASSWORD` | *(Deprecated)* Bitbucket app password for Basic Auth |

To create a User API token:
1. Go to Bitbucket **Personal settings** → **API tokens** (or Workspace settings for workspace tokens)
2. Create a new token with appropriate permissions:
   - **Repositories**: Read (minimum) or Write
   - **Pull requests**: Read (minimum), or Write to create/update PRs and comments
   - **Issues**: Read (minimum)

> **Note:** If you are using a Workspace or Project access token instead of a User API token, you can omit `BITBUCKET_USERNAME`. The legacy Basic Authentication method using `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD` is still supported but deprecated.

#### Optional Settings

| Variable | Default | Description |
|---|---|---|
| `BITBUCKET_LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |
| `BITBUCKET_TIMEOUT` | `30000` | Request timeout in milliseconds (1000–60000) |
| `BITBUCKET_ENABLE_METRICS` | `true` | Enable performance metrics collection (`true`/`false`) |
| `BITBUCKET_RETRY_ATTEMPTS` | `3` | Number of retry attempts on failure (0–5) |
| `BITBUCKET_RETRY_DELAY` | `1000` | Base delay between retries in milliseconds |
| `BITBUCKET_MAX_CONCURRENT` | `10` | Maximum concurrent API requests (1–100) |
| `BITBUCKET_ENABLE_CACHE` | `false` | Enable response caching (`true`/`false`) |
| `BITBUCKET_CACHE_MAX_AGE` | `300` | Cache TTL in seconds (60–3600) |
| `BITBUCKET_CACHE_MAX_SIZE` | `100` | Maximum number of cached entries (10–1000) |

### MCP Client Configuration

Add this server to your MCP client configuration. For Claude Desktop, add to your `claude_desktop_config.json`:

#### macOS/Linux
```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/bitbucket_mcp/build/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-atlassian-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

#### Windows
```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "node",
      "args": ["C:\\ABSOLUTE\\PATH\\TO\\bitbucket_mcp\\build\\index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-atlassian-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

#### Using NPX (Alternative)
```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "npx",
      "args": ["bitbucket-mcp-server"],
      "env": {
        "BITBUCKET_USERNAME": "your-atlassian-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

> **Note:** If you are using a Workspace or Project access token instead of a User API token, you can omit `BITBUCKET_USERNAME` from the configuration.

## Usage Examples

### List Repositories
```
List all repositories in the 'myworkspace' workspace
```

### Get Repository Details
```
Get details for the repository 'myworkspace/myrepo'
```

### List Pull Requests
```
Show all open pull requests for myworkspace/myrepo
```

### Get Pull Request Details
```
Get detailed information about pull request #123 in myworkspace/myrepo
```

### Create Pull Request
```
Create a pull request from feature/my-feature to main in myworkspace/myrepo with title "My Feature PR"
```

```
Create a PR from feature/login-revamp to develop in myworkspace/myrepo, title "Login Revamp", description "Revamped the login flow", and close the source branch after merge
```

### Update Pull Request
```
Update the title of pull request #123 in myworkspace/myrepo to "Improved Login Flow"
```

```
Update the description of pull request #123 in myworkspace/myrepo
```

### Create Pull Request Comment
```
Add a comment to pull request #123 in myworkspace/myrepo saying "Looks good to me!"
```

```
Add an inline comment on line 42 of the new version of src/file.js in pull request #123 saying "This needs optimization"
```

```
Add an inline comment on the change between line 25 (old version) and line 28 (new version) in src/file.js in pull request #123
```

### Get Pull Request Comments
```
List all comments and inline notes for pull request #123 in myworkspace/myrepo
```

```
Get the details of comment #456 on pull request #123 in myworkspace/myrepo
```

### List Issues
```
Show all open bugs in myworkspace/myrepo
```

### Get Recent Commits
```
Show the last 5 commits on the main branch of myworkspace/myrepo
```

## Tool Reference

### list-repositories
Lists repositories in a Bitbucket workspace.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `role` (optional): Filter by user role (owner, admin, contributor, member)
- `sort` (optional): Sort by (created_on, updated_on, name, size)

### get-repository
Gets detailed information about a specific repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug

### list-pull-requests
Lists pull requests for a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `state` (optional): Filter by state (OPEN, MERGED, DECLINED, SUPERSEDED)

### get-pull-request
Gets detailed information about a specific pull request.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID

### create-pull-request
Creates a new pull request in a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `title` (required): Title of the pull request
- `source_branch` (required): Source branch name (the branch with your changes)
- `destination_branch` (optional): Destination branch name (defaults to the repository's main branch)
- `description` (optional): Description of the pull request (supports Markdown)
- `close_source_branch` (optional): Whether to close the source branch after the PR is merged
- `reviewers` (optional): List of reviewer account UUIDs (e.g. `{account-uuid}`)

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### update-pr-description
Updates the title and/or description of an existing pull request.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `title` (optional): New title for the pull request
- `description` (optional): New description for the pull request

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### create-pr-comment
Creates a comment on a pull request. This tool can create both regular comments and inline comments on specific files and line numbers.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `content` (required): Comment content in plain text
- `file_path` (optional): Path to the file for inline comments
- `from_line` (optional): Line number in the old version of the file (for inline comments)
- `to_line` (optional): Line number in the new version of the file (for inline comments)

**Authentication Required:** This tool requires `BITBUCKET_API_TOKEN` environment variable to be set, and the token must have "Pull requests: Write" permission.

### list-pr-comments
Lists all comments on a pull request, including inline comments and replies.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID

### get-pr-comment
Gets detailed information about a specific comment on a pull request.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `pull_request_id` (required): Pull request ID
- `comment_id` (required): Comment ID

### list-issues
Lists issues for a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `state` (optional): Filter by state (new, open, resolved, on hold, invalid, duplicate, wontfix, closed)
- `kind` (optional): Filter by kind (bug, enhancement, proposal, task)

### list-branches
Lists branches for a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug

### get-commits
Gets recent commits for a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `branch` (optional): Specific branch name
- `limit` (optional): Number of commits (1-50, default: 10)

### get-commit
Gets detailed information about a specific commit in a repository.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `repo_slug` (required): Repository name/slug
- `commit_hash` (required): Commit hash (full 40-char or short 7+ char)

### search
Searches across repositories, pull requests, issues, and commits in a workspace.

**Parameters:**
- `workspace` (required): Bitbucket workspace name
- `query` (required): Search query (searches in titles, descriptions, and content)
- `types` (optional): Types of items to search (repositories, pull-requests, issues, commits) (default: `["repositories", "pull-requests", "issues"]`)
- `limit` (optional): Maximum number of results per type (default: 10)

### health-check
Checks connectivity to Bitbucket API and validates credentials.

**Parameters:**
- `workspace` (optional): Optional workspace to test access (defaults to 'atlassian')

### get-metrics
Gets server performance metrics and statistics.

**Parameters:**
None

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Running
```bash
npm start
```

### Testing
Run unit tests with Vitest:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

Generate test coverage report:
```bash
npm run test:coverage
```

## Authentication

This server supports both authenticated and unauthenticated requests:

- **Unauthenticated**: Can access public repositories with some limitations
- **Authenticated**: Full access to private repositories and enhanced rate limits

For authentication, use Bitbucket API Tokens (Workspace, Project, or Repository access tokens) for security. Apps Passwords are still supported but deprecated.

## Troubleshooting

### Common Issues

1. **"Failed to retrieve repositories"**: Check workspace name and authentication
2. **Rate limiting**: Bitbucket has API rate limits; authenticated requests have higher limits
3. **Private repositories not accessible**: Ensure your `BITBUCKET_API_TOKEN` has the correct permissions

### Debugging

The server logs debug information to stderr. Check your MCP client logs for error messages.

### Testing the Server

You can test the server directly:

```bash
npm run build
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node build/index.js
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
