# Bitbucket MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with Bitbucket repositories, pull requests, issues, and more.

## Features

This MCP server provides the following tools for Bitbucket integration:

### Repository Management
- **list-repositories**: List repositories in a Bitbucket workspace
- **get-repository**: Get detailed information about a specific repository

### Pull Requests
- **list-pull-requests**: List pull requests for a repository with filtering options
- **get-pull-request**: Get detailed information about a specific pull request
- **get-pr-diff**: Get the diff/changes of a specific pull request
- **create-pr-comment**: Create a comment on a pull request

### Issues
- **list-issues**: List issues for a repository with state and kind filtering

### Source Code
- **list-branches**: List all branches in a repository
- **get-commits**: Get recent commits with optional branch filtering

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

For private repositories and advanced features, set these environment variables:

```bash
export BITBUCKET_USERNAME="your-username"
export BITBUCKET_APP_PASSWORD="your-app-password"
```

To create an app password:
1. Go to Bitbucket Settings → Personal Bitbucket settings → App passwords
2. Create a new app password with appropriate permissions:
   - Repositories: Read
   - Pull requests: Read
   - Issues: Read
   - Account: Read

### MCP Client Configuration

Add this server to your MCP client configuration. For Claude Desktop, add to your `claude_desktop_config.json`:

#### macOS/Linux
```json
{
  "mcpServers": {
    "bitbucbitbucket-mcpket": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/bitbucket_mcp/build/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
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
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
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
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      },
      "type": "stdio"
    }
  }
}
```

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

**Authentication Required:** This tool requires BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set, and the app password must have "Pull requests: Write" permission.

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

## Authentication

This server supports both authenticated and unauthenticated requests:

- **Unauthenticated**: Can access public repositories with some limitations
- **Authenticated**: Full access to private repositories and enhanced rate limits

For authentication, use Bitbucket App Passwords (not your account password) for security.

## Troubleshooting

### Common Issues

1. **"Failed to retrieve repositories"**: Check workspace name and authentication
2. **Rate limiting**: Bitbucket has API rate limits; authenticated requests have higher limits
3. **Private repositories not accessible**: Ensure app password has correct permissions

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
