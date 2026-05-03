# Bitbucket MCP Server - Configuration Guide

This file shows example configurations for setting up the Bitbucket MCP server with different MCP clients.

## Claude Desktop Configuration

### macOS/Linux

Add this to your `claude_desktop_config.json` file (usually located at `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### Windows

Add this to your `claude_desktop_config.json` file (usually located at `%APPDATA%\Claude\claude_desktop_config.json`):

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

### Using NPX (Alternative)

`npx` fetches and runs the package on demand — no global install required:

```json
{
  "mcpServers": {
    "bitbucket-mcp": {
      "command": "npx",
      "args": ["-y", "-p", "bitbucket-mcp-server@latest", "bitbucket-mcp"],
      "env": {
        "BITBUCKET_USERNAME": "your-atlassian-email@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

> The `-p ... bitbucket-mcp` flag is required because the package ships two
> binaries (`bitbucket-mcp` for the MCP server, `bb` for the CLI), so `npx`
> can't infer which to run from the package name alone.
>
> **Note:** If you are using a Workspace or Project access token instead of a User API token, you can omit `BITBUCKET_USERNAME` from the configuration.

## Environment Variables

### Authentication (Required)

| Variable | Description |
|---|---|
| `BITBUCKET_API_TOKEN` | **(Required)** Your User API token or Workspace/Project token |
| `BITBUCKET_USERNAME` | **(Required for User API tokens)** Your Atlassian account email |
| `BITBUCKET_APP_PASSWORD` | *(Deprecated)* Bitbucket app password for Basic Auth |

> **Note:** `BITBUCKET_APP_PASSWORD` is supported for backward compatibility but is deprecated. Default setups should use `BITBUCKET_API_TOKEN` and `BITBUCKET_USERNAME`.

### Optional Configuration

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

## Creating a Bitbucket API Token

1. Go to **Bitbucket Personal settings** → **API tokens**
   (Or navigate to Workspace/Project settings for a scoped token)
2. Click **Create API token**
3. Give it a descriptive name like `MCP Server`
4. Select the minimum required permissions:
   - **Repositories**: Read
   - **Pull requests**: Read (or Write to create/update PRs and comments)
   - **Issues**: Read
5. Copy the generated token and set it as `BITBUCKET_API_TOKEN`

## Testing the Configuration

1. Make sure the server is built:
   ```bash
   npm run build
   ```
2. Test the server responds correctly:
   ```bash
   echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node build/index.js
   ```
3. Restart Claude Desktop
4. Look for the tools icon in Claude Desktop to confirm the server is connected

## Troubleshooting

- **Server not showing up**: Check the absolute path in your config and ensure the project has been built (`npm run build`)
- **Authentication errors**: Verify your `BITBUCKET_API_TOKEN` is valid and not expired
- **Permission errors**: Make sure your token has the required permissions for the operations you're performing
- **Build errors**: Run `npm install` followed by `npm run build`
- **Rate limiting**: Authenticated requests have higher rate limits than unauthenticated ones
