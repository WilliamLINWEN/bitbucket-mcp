# Bitbucket MCP Server - Project Context

This document provides essential information for AI CLI to understand the Bitbucket MCP Server project and its development environment.

## Project Overview
The **Bitbucket MCP Server** is a Model Context Protocol (MCP) server that provides a bridge between AI models and the Bitbucket API. It allows AI agents to interact with Bitbucket repositories, pull requests, issues, commits, and more.

### Key Technologies
- **Runtime:** Node.js (v20+)
- **Language:** TypeScript
- **MCP Framework:** `@modelcontextprotocol/sdk`
- **Validation:** `zod`
- **Testing:** `vitest`
- **Networking:** `node-fetch`

## Project Structure
- `src/index.ts`: The main entry point that starts the server.
- `src/server.ts`: Handles server instantiation, transport (Stdio), and lifecycle management.
- `src/bitbucket-api.ts`: Core Bitbucket API client implementation with retry logic and error handling.
- `src/tools/index.ts`: Orchestration-only entry that delegates to per-resource modules.
- `src/tools/<resource>.ts`: Per-resource tool implementations — `repositories`, `pull-requests`, `pr-comments`, `commits`, `branches`, `issues`, `pipelines`, `search`, `system`.
- `src/tools/helpers.ts`: Shared `makeRegister` factory used by the per-resource modules.
- `src/config.ts`: Configuration management and environment variable validation.
- `src/monitoring/`: Contains specialized monitors for process, protocol, and transport performance.
- `src/metrics.ts`: Collects and manages server performance metrics.
- `src/rate-limiting.ts`: Implements multi-tier rate limiting to prevent API abuse.

## Development Workflows

### Building
Compile the TypeScript source code into the `build/` directory:
```bash
npm run build
```

### Running
Start the server in production mode (requires a build):
```bash
npm start
```

For development with automatic recompilation:
```bash
npm run dev
```

### Testing
Run the test suite using Vitest:
```bash
npm test
```

Generate coverage reports:
```bash
npm run test:coverage
```

### Manual Testing
You can test the server directly via Stdio by sending JSON-RPC messages:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node build/index.js
```

## Configuration & Environment
The server requires authentication to access private repositories.

### Required Environment Variables
- `BITBUCKET_API_TOKEN`: (Recommended) A Bitbucket Workspace, Project, or Repository access token.
- **OR** (Deprecated): `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD`.

### Optional Environment Variables
- `BITBUCKET_LOG_LEVEL`: `error`, `warn`, `info`, `debug` (Default: `info`).
- `BITBUCKET_TIMEOUT`: Request timeout in ms (Default: `30000`).
- `BITBUCKET_ENABLE_METRICS`: Set to `true` or `false` (Default: `true`).

## Development Conventions
- **Tool Registration:** Each resource's tools register in its own `src/tools/<resource>.ts` module via the `makeRegister` helper (which wraps `server.registerTool`). `src/tools/index.ts` wires all modules together. Parameters are defined with `zod` schemas and descriptive labels.
- **Error Handling:** Use `recordError` and `createApiErrorContext` from `src/error-context.ts` for consistent error tracking.
- **Logging:** Use the custom logger in `src/debug-logger.ts` for internal debugging (outputs to stderr).
- **API Client:** Add new Bitbucket API endpoints to the `BitbucketAPI` class in `src/bitbucket-api.ts`.
- **Metrics:** Record tool usage and durations using the `metricsCollector` in `src/metrics.ts`.

## Available MCP Tools
- **Repository & code:** `repositories`, `commits`, `list-branches`, `search`
- **Pull Requests:** `pull-requests`, `create-pull-request`, `get-pr-diff`, `update-pr-description`
- **PR comments:** `pr-comments`, `create-pr-comment`
- **Issues:** `list-issues`
- **Pipelines:** `pipelines`, `trigger-pipeline`, `pipeline-steps`
- **System:** `health-check`, `get-metrics`
