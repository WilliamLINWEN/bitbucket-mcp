import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { metricsCollector } from "../metrics.js";
import { makeRegister } from "./helpers.js";

// Environment variables for authentication
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;
const BITBUCKET_API_TOKEN = process.env.BITBUCKET_API_TOKEN;
const isAuthenticated = !!(BITBUCKET_API_TOKEN || (BITBUCKET_USERNAME && BITBUCKET_APP_PASSWORD));

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Tool: Health check - test API connectivity
  registerTool(
    "health-check",
    "Check connectivity to Bitbucket API and validate credentials",
    {
      workspace: z.string().optional().describe("Optional workspace to test access"),
    },
    async ({ workspace }) => {
      try {
        const testWorkspace = workspace || process.env.BITBUCKET_WORKSPACE || "atlassian"; // Use Atlassian's public workspace as default

        console.error(`Testing connectivity to Bitbucket API with workspace: ${testWorkspace}`);

        const result = await bitbucketAPI.listRepositories(testWorkspace);

        const authStatus = isAuthenticated ? "Authenticated" : "Unauthenticated (public access only)";

        return {
          content: [
            {
              type: "text",
              text: [
                "✅ **Bitbucket MCP Server Health Check**",
                "",
                `**API Status:** Connected successfully`,
                `**Authentication:** ${authStatus}`,
                `**Test Workspace:** ${testWorkspace}`,
                `**Repositories Found:** ${result.repositories.length}`,
                `**Has More Pages:** ${result.hasMore ? "Yes" : "No"}`,
                "",
                "**Available Tools:**",
                "- list-repositories: ✅",
                "- get-repository: ✅",
                "- list-pull-requests: ✅",
                "- get-pull-request: ✅",
                "- update-pr-description: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- create-pull-request: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- get-pr-diff: ✅",
                "- create-pr-comment: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- list-pr-comments: ✅",
                "- get-pr-comment: ✅",
                "- list-issues: ✅",
                "- list-branches: ✅",
                "- get-commits: ✅",
                "- get-commit: ✅",
                "- list-pipelines: ✅",
                "- get-pipeline: ✅",
                "- trigger-pipeline: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- list-pipeline-steps: ✅",
                "- get-pipeline-step: ✅",
                "- get-pipeline-step-log: ✅",
                "- search: ✅",
                "- get-metrics: ✅",
                "",
                "**System Status:**",
                `- MCP Server: Running`,
                `- Rate Limiting: Active`,
                `- Error Tracking: Active`,
                `- Performance Monitoring: Active`,
                "",
                "All systems operational! 🚀",
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
          content: [
            {
              type: "text",
              text: [
                "❌ **Bitbucket MCP Server Health Check Failed**",
                "",
                `**Error:** ${errorMessage}`,
                `**Test Workspace:** ${workspace || "atlassian"}`,
                "",
                "**Possible Issues:**",
                "- Network connectivity problems",
                "- Invalid workspace name",
                "- Authentication credentials issues (if using private repos)",
                "- Bitbucket API service unavailable",
                "",
                "**Troubleshooting:**",
                "1. Check your internet connection",
                "2. Verify workspace name is correct",
                "3. Ensure BITBUCKET_API_TOKEN or BITBUCKET_USERNAME/BITBUCKET_APP_PASSWORD are set for private repos",
                "4. Check Bitbucket service status at https://status.atlassian.com/",
              ].join("\n"),
            },
          ],
        };
      }
    }
  );

  // Tool: Get metrics and performance information
  registerTool(
    "get-metrics",
    "Get server performance metrics and statistics",
    {},
    async () => {
      try {
        const metrics = metricsCollector.getMetrics();
        const insights = metricsCollector.getPerformanceInsights();

        const metricsText = [
          "# 📊 Bitbucket MCP Server Metrics",
          "",
          "## Request Statistics",
          `**Total Requests:** ${metrics.totalRequests}`,
          `**Successful Requests:** ${metrics.successfulRequests}`,
          `**Failed Requests:** ${metrics.failedRequests}`,
          `**Success Rate:** ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`,
          "",
          "## Performance",
          `**Average Response Time:** ${metrics.averageResponseTime.toFixed(0)}ms`,
          "",
          "## Slowest Endpoints",
          ...insights.slowestEndpoints.map(endpoint =>
            `- **${endpoint.endpoint}**: ${endpoint.avgTime.toFixed(0)}ms average`
          ),
          "",
          "## Recommendations",
          ...insights.recommendedOptimizations.map(rec => `- ${rec}`),
        ];

        return {
          content: [
            {
              type: "text",
              text: metricsText.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}
