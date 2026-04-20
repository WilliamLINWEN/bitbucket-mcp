import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Tool: List issues
  registerTool(
    "list-issues",
    "List issues for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      state: z.enum(["new", "open", "resolved", "on hold", "invalid", "duplicate", "wontfix", "closed"]).optional().describe("Filter by issue state"),
      kind: z.enum(["bug", "enhancement", "proposal", "task"]).optional().describe("Filter by issue kind"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, state, kind, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.getIssues(workspace, repo_slug, state, page, pagelen);
        const issues = result.issues;

        if (issues.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No issues found in '${workspace}/${repo_slug}'${state ? ` with state '${state}'` : ''}${kind ? ` of kind '${kind}'` : ''}.`,
              },
            ],
          };
        }

        // Filter by kind if specified (client-side since API doesn't support it)
        const filteredIssues = kind ? issues.filter(issue => issue.kind === kind) : issues;

        if (filteredIssues.length === 0) {
          const paginationHint = result.hasMore ? ` No matching issues on this page; use the next page URL to continue searching.` : '';
          return {
            content: [
              {
                type: "text",
                text: `No issues found in '${workspace}/${repo_slug}' matching the specified criteria.${paginationHint}${result.next ? `\nNext page: ${result.next}` : ''}`,
              },
            ],
          };
        }

        const issueText = filteredIssues.map((issue) => [
          `**Issue #${issue.id}**: ${issue.title}`,
          `  State: ${issue.state} | Priority: ${issue.priority} | Kind: ${issue.kind}`,
          `  Reporter: ${issue.reporter.display_name} (@${issue.reporter.username})`,
          issue.assignee ? `  Assignee: ${issue.assignee.display_name} (@${issue.assignee.username})` : "  Assignee: Unassigned",
          `  Created: ${new Date(issue.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(issue.updated_on).toLocaleDateString()}`,
          `  URL: ${issue.links.html.href}`,
          "---",
        ].join("\n"));

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${filteredIssues.length} issues in '${workspace}/${repo_slug}':\n\n${issueText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve issues for '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}
