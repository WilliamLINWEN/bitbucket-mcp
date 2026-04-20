import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI, Repository } from "../bitbucket-api.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

/**
 * Derive the URL-safe repo slug from a Repository object.
 * Uses the second segment of `full_name` ("workspace/slug"), falling back to
 * `name` if `full_name` has an unexpected shape.
 */
function getRepoSlug(repo: Repository): string {
  const parts = repo.full_name.split("/");
  return parts[1] ?? repo.name;
}

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
            const repoResult = await bitbucketAPI.listRepositories(workspace, { pagelen: 100 });
            const repos = repoResult.repositories;
            const matchingRepos = repos.filter(repo =>
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

            // Coverage note
            const coverageNote = repoResult.next
              ? `_(Searched ${repos.length} repositories — more available, refine query for complete results)_`
              : `_(Searched ${repos.length} repositories)_`;
            searchResults.push(coverageNote);
          } catch (error) {
            searchResults.push(`## 📁 Repositories - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search pull requests
        if (types.includes("pull-requests")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace, { pagelen: 100 });
            const repos = repoResult.repositories;
            let prCount = 0;
            let prIterCount = 0;

            for (const repo of repos) {
              if (prCount >= limit) break;
              prIterCount++;
              const slug = getRepoSlug(repo);
              try {
                const prResult = await bitbucketAPI.getPullRequests(workspace, slug, undefined, undefined, undefined);
                const matchingPRs = prResult.pullRequests.filter(pr =>
                  pr.title.toLowerCase().includes(query.toLowerCase()) ||
                  (pr.description && pr.description.toLowerCase().includes(query.toLowerCase()))
                ).slice(0, limit - prCount);

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
                  prCount += matchingPRs.length;
                }
              } catch (error) {
                const msg = error instanceof Error ? error.message : "Unknown error";
                searchResults.push(`⚠️ Failed to search PRs in ${slug}: ${msg}`);
              }
            }

            // Coverage note
            let coverageNote: string;
            if (prIterCount < repos.length) {
              coverageNote = `_(Searched ${prIterCount} of ${repos.length} retrieved repositories for PRs — hit limit of ${limit}, more matches may exist)_`;
            } else if (repoResult.next) {
              coverageNote = `_(Searched all ${repos.length} retrieved repositories for PRs — more available, refine query for complete results)_`;
            } else {
              coverageNote = `_(Searched all ${repos.length} repositories for PRs)_`;
            }
            searchResults.push(coverageNote);
          } catch (error) {
            searchResults.push(`## 🔀 Pull Requests - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search issues
        if (types.includes("issues")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace, { pagelen: 100 });
            const repos = repoResult.repositories;
            let issueCount = 0;
            let issueIterCount = 0;

            for (const repo of repos) {
              if (issueCount >= limit) break;
              issueIterCount++;
              const slug = getRepoSlug(repo);
              try {
                const issueResult = await bitbucketAPI.getIssues(workspace, slug, undefined, undefined, undefined);
                const matchingIssues = issueResult.issues.filter(issue =>
                  issue.title.toLowerCase().includes(query.toLowerCase()) ||
                  (issue.content?.raw && issue.content.raw.toLowerCase().includes(query.toLowerCase()))
                ).slice(0, limit - issueCount);

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
                  issueCount += matchingIssues.length;
                }
              } catch (error) {
                const msg = error instanceof Error ? error.message : "Unknown error";
                searchResults.push(`⚠️ Failed to search issues in ${slug}: ${msg}`);
              }
            }

            // Coverage note
            let coverageNote: string;
            if (issueIterCount < repos.length) {
              coverageNote = `_(Searched ${issueIterCount} of ${repos.length} retrieved repositories for issues — hit limit of ${limit}, more matches may exist)_`;
            } else if (repoResult.next) {
              coverageNote = `_(Searched all ${repos.length} retrieved repositories for issues — more available, refine query for complete results)_`;
            } else {
              coverageNote = `_(Searched all ${repos.length} repositories for issues)_`;
            }
            searchResults.push(coverageNote);
          } catch (error) {
            searchResults.push(`## 🐛 Issues - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Search commits
        if (types.includes("commits")) {
          try {
            const repoResult = await bitbucketAPI.listRepositories(workspace, { pagelen: 100 });
            const repos = repoResult.repositories;
            let commitCount = 0;
            let commitIterCount = 0;

            for (const repo of repos) {
              if (commitCount >= limit) break;
              commitIterCount++;
              const slug = getRepoSlug(repo);
              try {
                const commitResult = await bitbucketAPI.getCommits(workspace, slug, undefined, undefined, undefined);
                const matchingCommits = commitResult.commits.filter(commit =>
                  commit.message.toLowerCase().includes(query.toLowerCase())
                ).slice(0, limit - commitCount);

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
                  commitCount += matchingCommits.length;
                }
              } catch (error) {
                const msg = error instanceof Error ? error.message : "Unknown error";
                searchResults.push(`⚠️ Failed to search commits in ${slug}: ${msg}`);
              }
            }

            // Coverage note
            let coverageNote: string;
            if (commitIterCount < repos.length) {
              coverageNote = `_(Searched ${commitIterCount} of ${repos.length} retrieved repositories for commits — hit limit of ${limit}, more matches may exist)_`;
            } else if (repoResult.next) {
              coverageNote = `_(Searched all ${repos.length} retrieved repositories for commits — more available, refine query for complete results)_`;
            } else {
              coverageNote = `_(Searched all ${repos.length} repositories for commits)_`;
            }
            searchResults.push(coverageNote);
          } catch (error) {
            searchResults.push(`## 💾 Commits - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        if (totalResults === 0) {
          // Even when no results found, surface any warnings collected
          const warnings = searchResults.filter(r => r.startsWith("⚠️") || r.includes(" - Error:") || r.includes("more available") || r.startsWith("_(Searched"));
          const warningText = warnings.length > 0 ? `\n\n${warnings.join("\n")}` : "";
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${query}" in workspace '${workspace}' across the specified types: ${types.join(", ")}.${warningText}`,
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
