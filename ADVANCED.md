# Advanced Features

This document describes the advanced features and capabilities of the Bitbucket MCP server.

## Health Check Tool

The server includes a `health-check` tool that allows you to test connectivity and validate your setup:

```json
{
  "tool": "health-check",
  "arguments": {
    "workspace": "your-workspace-name"  // Optional
  }
}
```

### What it checks:
- API connectivity to Bitbucket
- Authentication status
- Access to specified workspace (or public Atlassian workspace by default)
- Lists all available tools and their status

### Example usage in Claude Desktop:
Ask: "Check the health of the Bitbucket MCP server"

## Enhanced Error Handling

All tools now include comprehensive error handling with:
- Detailed error messages
- Troubleshooting suggestions
- Graceful fallbacks for authentication issues

## Logging and Debugging

The server provides detailed logging to stderr for debugging:
- API request tracking
- Authentication status
- Response status codes
- Error details

To see debug logs when running:
```bash
node build/index.js 2>debug.log
```

## API Rate Limiting

Be aware of Bitbucket's API rate limits:
- **Unauthenticated requests**: 1,000 requests per hour per IP
- **Authenticated requests**: 1,000 requests per hour per user

The server handles rate limiting gracefully and will report appropriate errors.

## Authentication Modes

### Public Access
- No credentials required
- Can access public repositories
- Limited to public workspaces and repositories

### Authenticated Access
- Requires BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD
- Can access private repositories you have permission to view
- Higher rate limits
- Full API functionality

## Security Best Practices

1. **App Passwords**: Always use Bitbucket App Passwords, never your account password
2. **Environment Variables**: Store credentials in environment variables, not in code
3. **Minimal Permissions**: Create App Passwords with only required permissions:
   - Repositories: Read
   - Pull requests: Read
   - Issues: Read
   - Account: Read (for user info)

## Troubleshooting Common Issues

### "Failed to fetch repositories" error
- Check workspace name spelling
- Verify the workspace exists and is accessible
- For private workspaces, ensure authentication is set up

### Authentication errors
- Verify BITBUCKET_USERNAME is correct
- Regenerate your App Password in Bitbucket settings
- Check that the App Password has required permissions

### Network errors
- Check internet connectivity
- Verify corporate firewall doesn't block api.bitbucket.org
- Check Bitbucket service status at https://status.atlassian.com/

## Performance Optimization

- The server caches nothing to ensure fresh data
- For better performance with large datasets, consider pagination
- Use specific filters (state, kind) to reduce data transfer

## Future Enhancements

Planned features for future versions:
- Webhook management
- Advanced search and filtering
- Bulk operations
- Unit tests and integration tests
- Performance monitoring
