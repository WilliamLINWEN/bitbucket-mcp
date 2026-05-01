import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { metricsCollector } from "../metrics.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { makeRegister } from "./helpers.js";
import * as systemCore from "../core/system.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Tool: Health check - test API connectivity
  registerTool(
    "health-check",
    "Check connectivity to Bitbucket API and validate credentials",
    {
      workspace: z.string().optional().describe("Optional workspace to test access"),
    },
    withRequestTracking("health-check", async ({ workspace }) => {
      console.error(`Testing connectivity to Bitbucket API...`);

      const result = await systemCore.authStatus(bitbucketAPI, { workspace });
      const isAuthenticated = result.authenticated;

      if (result.reachable) {
        const authLabel = isAuthenticated
          ? "Authenticated"
          : "Unauthenticated (public access only)";

        return {
          content: [
            {
              type: "text",
              text: [
                "✅ **Bitbucket MCP Server Health Check**",
                "",
                `**API Status:** Connected successfully`,
                `**Authentication:** ${authLabel}`,
                `**Test Workspace:** ${result.workspaceTested}`,
                `**Repositories Found:** ${result.repositoriesFound ?? 0}`,
                `**Has More Pages:** ${result.hasMoreRepos ? "Yes" : "No"}`,
                "",
                "**Available Tools:**",
                "- repositories: ✅",
                "- pull-requests: ✅",
                "- update-pr-description: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- create-pull-request: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- get-pr-diff: ✅",
                "- pr-comments: ✅",
                "- create-pr-comment: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- list-issues: ✅",
                "- list-branches: ✅",
                "- commits: ✅",
                "- pipelines: ✅",
                "- trigger-pipeline: " + (isAuthenticated ? "✅" : "❌ (requires auth)"),
                "- pipeline-steps: ✅",
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
      } else {
        return {
          content: [
            {
              type: "text",
              text: [
                "❌ **Bitbucket MCP Server Health Check Failed**",
                "",
                `**Error:** ${result.error}`,
                `**Test Workspace:** ${result.workspaceTested}`,
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
    })
  );

  // Tool: Get metrics and performance information
  registerTool(
    "get-metrics",
    "Get server performance metrics and statistics",
    {},
    withRequestTracking("get-metrics", async () => {
      try {
        const metrics = metricsCollector.getMetrics();
        const insights = metricsCollector.getPerformanceInsights();

        const successRate = metrics.totalRequests === 0
          ? "N/A (0 requests)"
          : `${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`;

        const metricsText = [
          "# 📊 Bitbucket MCP Server Metrics",
          "",
          "## Request Statistics",
          `**Total Requests:** ${metrics.totalRequests}`,
          `**Successful Requests:** ${metrics.successfulRequests}`,
          `**Failed Requests:** ${metrics.failedRequests}`,
          `**Success Rate:** ${successRate}`,
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
    })
  );
}
