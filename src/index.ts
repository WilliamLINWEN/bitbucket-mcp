#!/usr/bin/env node

import { startServer } from "./server.js";

// Start the Bitbucket MCP Server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
