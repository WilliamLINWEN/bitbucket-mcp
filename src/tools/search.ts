import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";
import * as searchCore from "../core/search.js";
import type { SearchResult, SearchSectionMeta } from "../core/types.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Tool: Universal search across repositories, pull requests, issues, and commits
  registerTool(
    "search",
    "Search across repositories, pull requests, issues, and commits in a workspace",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      query: z.string().min(1).describe("Search query (searches in titles, descriptions, and content)"),
      types: z.array(z.enum(["repositories", "pull-requests", "issues", "commits"])).optional().default(["repositories", "pull-requests", "issues"]).describe("Types of items to search"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum number of results per type"),
    },
    async ({ workspace: ws, query, types, limit }) => {
      try {
        const workspace = resolveWorkspace(ws);
        const result = await searchCore.search(bitbucketAPI, { workspace, query, types, limit });
        return formatSearchResult(result, types, limit);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}

function buildCoverageNote(
  section: SearchSectionMeta,
  typeName: string,
  limit: number,
): string {
  const { searched, totalRepos, hasMoreRepos } = section;
  if (searched < totalRepos) {
    return `_(Searched ${searched} of ${totalRepos} retrieved repositories for ${typeName} — hit limit of ${limit}, more matches may exist)_`;
  } else if (hasMoreRepos) {
    return `_(Searched all ${totalRepos} retrieved repositories for ${typeName} — more available, refine query for complete results)_`;
  } else {
    return `_(Searched all ${totalRepos} repositories for ${typeName})_`;
  }
}

function formatSearchResult(
  result: SearchResult,
  types: string[],
  limit: number,
): { content: Array<{ type: string; text: string }> } {
  const { workspace, query, hits, sections } = result;
  const searchResults: string[] = [];
  let totalResults = 0;

  // Render repositories section
  if (types.includes("repositories")) {
    const section = sections.find((s) => s.type === "repositories");
    if (section && section.errors.length > 0 && section.errors[0].repo === "(workspace)") {
      searchResults.push(`## 📁 Repositories - Error: ${section.errors[0].message}`);
    } else if (section) {
      if (hits.repositories.length > 0) {
        searchResults.push(`## 📁 Repositories (${hits.repositories.length} found)`);
        hits.repositories.forEach(({ item: repo }) => {
          searchResults.push([
            `**${repo.name}** - ${repo.description || "No description"}`,
            `  Language: ${repo.language || "Unknown"} | Private: ${repo.is_private ? "Yes" : "No"}`,
            `  URL: ${repo.links.html.href}`,
            ""
          ].join("\n"));
        });
        totalResults += hits.repositories.length;
      }
      // Coverage note
      searchResults.push(buildCoverageNote(section, "repositories", limit));
    }
  }

  // Render pull-requests section
  if (types.includes("pull-requests")) {
    const section = sections.find((s) => s.type === "pull-requests");
    if (section && section.errors.length === 1 && section.errors[0].repo === "(workspace)") {
      searchResults.push(`## 🔀 Pull Requests - Error: ${section.errors[0].message}`);
    } else if (section) {
      // Per-repo errors
      section.errors.forEach(({ repo, message }) => {
        searchResults.push(`⚠️ Failed to search PRs in ${repo}: ${message}`);
      });

      if (hits.pullRequests.length > 0) {
        // Group by repo for header (original tool used first found repo in header)
        const firstRepo = hits.pullRequests[0].repo;
        searchResults.push(`## 🔀 Pull Requests (${hits.pullRequests.length} found in ${firstRepo})`);
        hits.pullRequests.forEach(({ item: pr, repo }) => {
          searchResults.push([
            `**PR #${pr.id}**: ${pr.title} (${repo})`,
            `  State: ${pr.state} | Author: ${pr.author.display_name}`,
            `  ${pr.source.branch.name} → ${pr.destination.branch.name}`,
            `  URL: ${pr.links.html.href}`,
            ""
          ].join("\n"));
        });
        totalResults += hits.pullRequests.length;
      }
      // Coverage note
      searchResults.push(buildCoverageNote(section, "PRs", limit));
    }
  }

  // Render issues section
  if (types.includes("issues")) {
    const section = sections.find((s) => s.type === "issues");
    if (section && section.errors.length === 1 && section.errors[0].repo === "(workspace)") {
      searchResults.push(`## 🐛 Issues - Error: ${section.errors[0].message}`);
    } else if (section) {
      // Per-repo errors
      section.errors.forEach(({ repo, message }) => {
        searchResults.push(`⚠️ Failed to search issues in ${repo}: ${message}`);
      });

      if (hits.issues.length > 0) {
        const firstRepo = hits.issues[0].repo;
        searchResults.push(`## 🐛 Issues (${hits.issues.length} found in ${firstRepo})`);
        hits.issues.forEach(({ item: issue, repo }) => {
          searchResults.push([
            `**Issue #${issue.id}**: ${issue.title} (${repo})`,
            `  State: ${issue.state} | Kind: ${issue.kind} | Priority: ${issue.priority}`,
            `  Reporter: ${issue.reporter.display_name}`,
            `  URL: ${issue.links.html.href}`,
            ""
          ].join("\n"));
        });
        totalResults += hits.issues.length;
      }
      // Coverage note
      searchResults.push(buildCoverageNote(section, "issues", limit));
    }
  }

  // Render commits section
  if (types.includes("commits")) {
    const section = sections.find((s) => s.type === "commits");
    if (section && section.errors.length === 1 && section.errors[0].repo === "(workspace)") {
      searchResults.push(`## 💾 Commits - Error: ${section.errors[0].message}`);
    } else if (section) {
      // Per-repo errors
      section.errors.forEach(({ repo, message }) => {
        searchResults.push(`⚠️ Failed to search commits in ${repo}: ${message}`);
      });

      if (hits.commits.length > 0) {
        const firstRepo = hits.commits[0].repo;
        searchResults.push(`## 💾 Commits (${hits.commits.length} found in ${firstRepo})`);
        hits.commits.forEach(({ item: commit, repo }) => {
          searchResults.push([
            `**${commit.hash.substring(0, 8)}**: ${commit.message.split('\n')[0]} (${repo})`,
            `  Author: ${commit.author.user ? commit.author.user.display_name : commit.author.raw}`,
            `  Date: ${new Date(commit.date).toLocaleDateString()}`,
            `  URL: ${commit.links.html.href}`,
            ""
          ].join("\n"));
        });
        totalResults += hits.commits.length;
      }
      // Coverage note
      searchResults.push(buildCoverageNote(section, "commits", limit));
    }
  }

  if (totalResults === 0) {
    // Even when no results found, surface any warnings, coverage notes, and errors collected
    const additionalInfo = searchResults.filter(r => r.startsWith("⚠️") || r.includes(" - Error:") || r.includes("more available") || r.startsWith("_(Searched"));
    const additionalInfoText = additionalInfo.length > 0 ? `\n\n${additionalInfo.join("\n")}` : "";
    return {
      content: [
        {
          type: "text",
          text: `No results found for "${query}" in workspace '${workspace}' across the specified types: ${types.join(", ")}.${additionalInfoText}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `# Search Results for "${query}" in '${workspace}'\n\nFound ${totalResults} total results:\n\n${searchResults.join("\n")}`,
      },
    ],
  };
}
