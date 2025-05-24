# Bitbucket MCP Server - Example Configuration

This file shows example configurations for setting up the Bitbucket MCP server with different MCP clients.

## Claude Desktop Configuration

### macOS/Linux

Add this to your `claude_desktop_config.json` file (usually located at `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/Users/william.lin/workspace/bitbucket_mcp/build/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
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
    "bitbucket": {
      "command": "node",
      "args": ["C:\\path\\to\\bitbucket_mcp\\build\\index.js"],
      "env": {
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

## Environment Variables

Instead of putting credentials in the config file, you can set them as environment variables:

```bash
export BITBUCKET_USERNAME="your-username"
export BITBUCKET_APP_PASSWORD="your-app-password"
```

Then use this simplified configuration:

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket_mcp/build/index.js"]
    }
  }
}
```

## Creating a Bitbucket App Password

1. Go to Bitbucket Settings → Personal Bitbucket settings → App passwords
2. Click "Create app password"
3. Give it a descriptive name like "MCP Server"
4. Select these permissions:
   - **Account**: Read
   - **Repositories**: Read
   - **Pull requests**: Read
   - **Issues**: Read
5. Copy the generated password and use it as `BITBUCKET_APP_PASSWORD`

## Testing the Configuration

1. Make sure the server is built: `npm run build`
2. Test it works: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node build/index.js`
3. Restart Claude Desktop
4. Look for the tools icon in Claude Desktop to confirm the server is connected

## Troubleshooting

- **Server not showing up**: Check the absolute path in your config
- **Authentication errors**: Verify your username and app password
- **Permission errors**: Make sure your app password has the required permissions
- **Build errors**: Run `npm run build` to ensure the server is compiled
