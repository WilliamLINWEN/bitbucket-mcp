import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

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
      const searchResults: string[] = [];
      let totalResults = 0;

      try {
        const workspace = resolveWorkspace(ws);
        // Search repositories
        if (types.includes("repositories")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace);
            const matchingRepos = repoResult.repositories.filter(repo =>
              repo.name.toLowerCase().includes(query.toLowerCase()) ||
              (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
            ).slice(0, limit);

            if (matchingRepos.length > 0) {
              searchResults.push(`## 📁 Repositories (${matchingRepos.length} found)`);
              matchingRepos.forEach(repo => {
                searchResults.push([
                  `**${repo.name}** - ${repo.description || "No description"}`,
                  `  Language: ${repo.language || "Unknown"} | Private: ${repo.is_private ? "Yes" : "No"}`,
                  `  URL: ${repo.links.html.href}`,
                  ""
                ].join("\n"));
              });
              totalResults += matchingRepos.length;
            }
          } catch (error) {
            searchResults.push(`## 📁 Repositories - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search pull requests (sample from a few repositories)
        if (types.includes("pull-requests")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace);
            const repos = repoResult.repositories.slice(0, 3); // Search in first 3 repos to avoid rate limits

            for (const repo of repos) {
              try {
                const prResult = await bitbucketAPI.getPullRequests(workspace, repo.name);
                const matchingPRs = prResult.pullRequests.filter(pr =>
                  pr.title.toLowerCase().includes(query.toLowerCase()) ||
                  (pr.description && pr.description.toLowerCase().includes(query.toLowerCase()))
                ).slice(0, Math.ceil(limit / repos.length));

                if (matchingPRs.length > 0) {
                  if (totalResults === 0 || !searchResults.some(r => r.includes("Pull Requests"))) {
                    searchResults.push(`## 🔀 Pull Requests (${matchingPRs.length} found in ${repo.name})`);
                  }
                  matchingPRs.forEach(pr => {
                    searchResults.push([
                      `**PR #${pr.id}**: ${pr.title} (${repo.name})`,
                      `  State: ${pr.state} | Author: ${pr.author.display_name}`,
                      `  ${pr.source.branch.name} → ${pr.destination.branch.name}`,
                      `  URL: ${pr.links.html.href}`,
                      ""
                    ].join("\n"));
                  });
                  totalResults += matchingPRs.length;
                }
              } catch (error) {
                // Silently continue if PR search fails for a repo
              }
            }
          } catch (error) {
            searchResults.push(`## 🔀 Pull Requests - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search issues (sample from a few repositories)
        if (types.includes("issues")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace);
            const repos = repoResult.repositories.slice(0, 3); // Search in first 3 repos

            for (const repo of repos) {
              try {
                const issueResult = await bitbucketAPI.getIssues(workspace, repo.name);
                const matchingIssues = issueResult.issues.filter(issue =>
                  issue.title.toLowerCase().includes(query.toLowerCase()) ||
                  (issue.content?.raw && issue.content.raw.toLowerCase().includes(query.toLowerCase()))
                ).slice(0, Math.ceil(limit / repos.length));

                if (matchingIssues.length > 0) {
                  if (totalResults === 0 || !searchResults.some(r => r.includes("Issues"))) {
                    searchResults.push(`## 🐛 Issues (${matchingIssues.length} found in ${repo.name})`);
                  }
                  matchingIssues.forEach(issue => {
                    searchResults.push([
                      `**Issue #${issue.id}**: ${issue.title} (${repo.name})`,
                      `  State: ${issue.state} | Kind: ${issue.kind} | Priority: ${issue.priority}`,
                      `  Reporter: ${issue.reporter.display_name}`,
                      `  URL: ${issue.links.html.href}`,
                      ""
                    ].join("\n"));
                  });
                  totalResults += matchingIssues.length;
                }
              } catch (error) {
                // Silently continue if issue search fails for a repo
              }
            }
          } catch (error) {
            searchResults.push(`## 🐛 Issues - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search commits (sample from a few repositories)
        if (types.includes("commits")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace);
            const repos = repoResult.repositories.slice(0, 2); // Search in first 2 repos

            for (const repo of repos) {
              try {
                const commitResult = await bitbucketAPI.getCommits(workspace, repo.name);
                const matchingCommits = commitResult.commits.filter(commit =>
                  commit.message.toLowerCase().includes(query.toLowerCase())
                ).slice(0, Math.ceil(limit / repos.length));

                if (matchingCommits.length > 0) {
                  if (totalResults === 0 || !searchResults.some(r => r.includes("Commits"))) {
                    searchResults.push(`## 💾 Commits (${matchingCommits.length} found in ${repo.name})`);
                  }
                  matchingCommits.forEach(commit => {
                    searchResults.push([
                      `**${commit.hash.substring(0, 8)}**: ${commit.message.split('\n')[0]} (${repo.name})`,
                      `  Author: ${commit.author.user ? commit.author.user.display_name : commit.author.raw}`,
                      `  Date: ${new Date(commit.date).toLocaleDateString()}`,
                      `  URL: ${commit.links.html.href}`,
                      ""
                    ].join("\n"));
                  });
                  totalResults += matchingCommits.length;
                }
              } catch (error) {
                // Silently continue if commit search fails for a repo
              }
            }
          } catch (error) {
            searchResults.push(`## 💾 Commits - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        if (totalResults === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${query}" in workspace '${workspace}' across the specified types: ${types.join(", ")}.`,
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
