import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";
import * as repositoriesCore from "../core/repositories.js";
import type { ListRepositoriesResult, GetRepositoryResult } from "../core/types.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  registerTool(
    "repositories",
    "List repositories in a Bitbucket workspace, or get details for a single repository when `repo_slug` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().optional().describe("Repository slug/name. If provided, returns a single repository; otherwise lists repositories."),
      role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("(list only) Filter by user role"),
      sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("(list only) Sort by field"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("repositories", async ({ workspace: ws, repo_slug, role, sort, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        if (repo_slug) {
          const repo = await repositoriesCore.getRepository(bitbucketAPI, { workspace, repo_slug });
          return { content: [{ type: "text", text: formatRepositoryDetail(workspace, repo) }] };
        }
        const result = await repositoriesCore.listRepositories(bitbucketAPI, {
          workspace, role, sort, page, pagelen,
        });
        return { content: [{ type: "text", text: formatRepositoryList(workspace, result) }] };
      } catch (error) {
        if (repo_slug) {
          return {
            content: [{
              type: "text",
              text: `Failed to retrieve repository '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : "Unknown error"}`,
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: `Failed to retrieve repositories: ${error instanceof Error ? error.message : "Unknown error"}`,
          }],
        };
      }
    }),
  );
}

function formatRepositoryList(workspace: string, result: ListRepositoriesResult): string {
  if (result.items.length === 0) {
    return `No repositories found in workspace '${workspace}'.`;
  }

  const repoText = result.items.map((repo) => [
    `**${repo.name}** - ${repo.description || "No description"}`,
    `  Language: ${repo.language || "Unknown"} | Private: ${repo.is_private ? "Yes" : "No"}`,
    `  Size: ${repo.size} bytes`,
    `  Created: ${new Date(repo.created_on).toLocaleDateString()}`,
    `  Updated: ${new Date(repo.updated_on).toLocaleDateString()}`,
    `  Owner: ${repo.owner.display_name} (@${repo.owner.username})`,
    `  URL: ${repo.links.html.href}`,
    "---",
  ].join("\n"));

  const paginationText = [
    result.page !== undefined ? `Page: ${result.page}` : null,
    result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
    result.next ? `Next page: ${result.next}` : null,
  ].filter(Boolean).join("\n");

  return `Found ${result.items.length} repositories in workspace '${workspace}':\n\n${repoText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`;
}

function formatRepositoryDetail(workspace: string, repo: GetRepositoryResult): string {
  const cloneUrls = repo.links.clone?.map((link: any) => `${link.name}: ${link.href}`).join("\n  ") || "No clone URLs available";
  const repoInfo = [
    `# ${repo.name}`,
    `**Full Name:** ${repo.full_name}`,
    `**Description:** ${repo.description || "No description"}`,
    `**Language:** ${repo.language || "Unknown"}`,
    `**Private:** ${repo.is_private ? "Yes" : "No"}`,
    `**Size:** ${repo.size} bytes`,
    `**Created:** ${new Date(repo.created_on).toLocaleString()}`,
    `**Updated:** ${new Date(repo.updated_on).toLocaleString()}`,
    `**Owner:** ${repo.owner.display_name} (@${repo.owner.username})`,
    `**URL:** ${repo.links.html.href}`,
    `**Clone URLs:**`,
    `  ${cloneUrls}`,
  ].join("\n");
  return repoInfo;
}
