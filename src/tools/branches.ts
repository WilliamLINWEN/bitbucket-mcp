import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Tool: List branches
  registerTool(
    "list-branches",
    "List branches for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.getBranches(workspace, repo_slug, page, pagelen);
        const branches = result.branches;

        if (branches.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No branches found in '${workspace}/${repo_slug}'.`,
              },
            ],
          };
        }

        const branchText = branches.map((branch) => [
          `**${branch.name}**`,
          `  Last commit: ${branch.target.hash.substring(0, 8)}`,
          `  Commit message: ${branch.target.message}`,
          `  Author: ${branch.target.author.raw}`,
          `  Date: ${new Date(branch.target.date).toLocaleDateString()}`,
          `  URL: ${branch.links.html.href}`,
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
              text: `Found ${branches.length} branches in '${workspace}/${repo_slug}':\n\n${branchText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve branches for '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}
