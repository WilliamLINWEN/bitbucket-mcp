import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import logger from "../debug-logger.js";
import { metricsCollector } from "../metrics.js";

// Environment variables for authentication
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;
const BITBUCKET_API_TOKEN = process.env.BITBUCKET_API_TOKEN;
const isAuthenticated = !!(BITBUCKET_API_TOKEN || (BITBUCKET_USERNAME && BITBUCKET_APP_PASSWORD));

export function registerTools(server: McpServer, bitbucketAPI: BitbucketAPI) {
  // Tool: List repositories for a workspace
  server.tool(
    "list-repositories",
    "List repositories in a Bitbucket workspace",
    {
      workspace: z.string().describe("Bitbucket workspace name (username or team name)"),
      role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("Filter by user role"),
      sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("Sort repositories by"),
      page: z.string().optional().describe("Page number or next page URL for pagination"),
      pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page (default: 10, max: 100)"),
    },
    withRequestTracking("list-repositories", async ({ workspace, role, sort, page, pagelen }) => {
      try {
        const result = await bitbucketAPI.listRepositories(workspace, { role, sort, page, pagelen });
        const repositories = result.repositories;

        if (repositories.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No repositories found in workspace '${workspace}'.`,
              },
            ],
          };
        }

        const repoText = repositories.map((repo) => [
          `**${repo.name}** - ${repo.description || "No description"}`,
          `  Language: ${repo.language || "Unknown"} | Private: ${repo.is_private ? "Yes" : "No"}`,
          `  Size: ${repo.size} bytes`,
          `  Created: ${new Date(repo.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(repo.updated_on).toLocaleDateString()}`,
          `  Owner: ${repo.owner.display_name} (@${repo.owner.username})`,
          `  URL: ${repo.links.html.href}`,
          "---",
        ].join("\n"));

        return {
          content: [
            {
              type: "text",
              text: `Found ${repositories.length} repositories in workspace '${workspace}':\n\n${repoText.join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve repositories: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    })
  );

  // Tool: Get repository details
  server.tool(
    "get-repository",
    "Get detailed information about a specific repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
    },
    async ({ workspace, repo_slug }) => {
      try {
        const repo = await bitbucketAPI.getRepository(workspace, repo_slug);

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

        return {
          content: [
            {
              type: "text",
              text: repoInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve repository '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: List pull requests
  server.tool(
    "list-pull-requests",
    "List pull requests for a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      state: z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]).optional().describe("Filter by PR state"),
    },
    async ({ workspace, repo_slug, state }) => {
      try {
        const result = await bitbucketAPI.getPullRequests(workspace, repo_slug, state);
        const pullRequests = result.pullRequests;

        if (pullRequests.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No pull requests found in '${workspace}/${repo_slug}'${state ? ` with state '${state}'` : ''}.`,
              },
            ],
          };
        }

        const prText = pullRequests.map((pr) => [
          `**PR #${pr.id}**: ${pr.title}`,
          `  State: ${pr.state} | Author: ${pr.author.display_name} (@${pr.author.username})`,
          `  ${pr.source.branch.name} → ${pr.destination.branch.name}`,
          `  Created: ${new Date(pr.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(pr.updated_on).toLocaleDateString()}`,
          `  URL: ${pr.links.html.href}`,
          "---",
        ].join("\n"));

        return {
          content: [
            {
              type: "text",
              text: `Found ${pullRequests.length} pull requests in '${workspace}/${repo_slug}':\n\n${prText.join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve pull requests for '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get pull request diff
  server.tool(
    "get-pr-diff",
    "Get the diff/changes for a specific pull request",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
    },
    async ({ workspace, repo_slug, pull_request_id }) => {
      try {
        const diff = await bitbucketAPI.getPullRequestDiff(workspace, repo_slug, pull_request_id);

        if (!diff || diff.trim().length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No diff available for pull request #${pull_request_id} in '${workspace}/${repo_slug}'. This could be because:\n- The pull request has no changes\n- The pull request has been merged or closed\n- There are permission issues`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Diff for Pull Request #${pull_request_id} in '${workspace}/${repo_slug}':\n\n\`\`\`diff\n${diff}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve diff for pull request #${pull_request_id} in '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Create pull request comment
  server.tool(
    "create-pr-comment",
    "Create a comment on a pull request",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      content: z.string().min(1).describe("Comment content in plain text"),
      file_path: z.string().optional().describe("Path to the file for inline comments"),
      from_line: z.number().optional().describe("Line number in the old version of the file (for inline comments)"),
      to_line: z.number().optional().describe("Line number in the new version of the file (for inline comments)"),
    },
    async ({ workspace, repo_slug, pull_request_id, content, file_path, from_line, to_line }) => {
      try {
        // Check if authentication is available for creating comments
        if (!process.env.BITBUCKET_API_TOKEN && (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Authentication required: Creating comments requires either BITBUCKET_API_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
              },
            ],
          };
        }

        // Set up inline options if file_path is provided
        const inlineOptions = file_path ? {
          path: file_path,
          from: from_line,
          to: to_line
        } : undefined;

        const comment = await bitbucketAPI.createPullRequestComment(
          workspace,
          repo_slug,
          pull_request_id,
          content,
          inlineOptions
        );

        // Build the success message
        const successLines = [
          `✅ **Comment created successfully on PR #${pull_request_id}**`,
          "",
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Comment ID:** ${comment.id}`,
          `**Author:** ${comment.user.display_name} (@${comment.user.username})`,
          `**Created:** ${new Date(comment.created_on).toLocaleString()}`,
          `**URL:** ${comment.links.html.href}`,
        ];

        if (inlineOptions) {
          successLines.push("", `**Inline Comment Details:**`);
          successLines.push(`  File: ${file_path}`);
          if (from_line !== undefined) {
            successLines.push(`  From line: ${from_line}`);
          }
          if (to_line !== undefined) {
            successLines.push(`  To line: ${to_line}`);
          }
        }

        successLines.push("", `**Comment Content:**`);
        successLines.push(`"${content}"`);

        return {
          content: [
            {
              type: "text",
              text: successLines.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let helpMessage = "";

        // Provide specific troubleshooting based on error type
        if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify your BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are correct\n- Ensure the app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("403")) {
          helpMessage = "\n\n**Troubleshooting:**\n- You may not have permission to comment on this pull request\n- Ensure your app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("404")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify the workspace, repository, and pull request ID are correct\n- The pull request may not exist or may be private";
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create comment on PR #${pull_request_id} in '${workspace}/${repo_slug}': ${errorMessage}${helpMessage}`,
            },
          ],
        };
      }
    }
  );

  // Tool: List pull request comments
  server.tool(
    "list-pr-comments",
    "List all comments on a pull request, including inline comments and replies",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace, repo_slug, pull_request_id, page, pagelen }) => {
      try {
        const result = await bitbucketAPI.getPullRequestComments(workspace, repo_slug, pull_request_id, { page, pagelen });
        const comments = result.comments;

        if (comments.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No comments found on pull request #${pull_request_id} in '${workspace}/${repo_slug}'.`,
              },
            ],
          };
        }

        const commentText = comments.map((comment) => {
          const lines = [
            `**Comment #${comment.id}** by ${comment.user.display_name} (@${comment.user.username})`,
            `  Created: ${new Date(comment.created_on).toLocaleString()}`,
          ];

          if (comment.parent) {
            lines.push(`  ↳ Reply to comment #${comment.parent.id}`);
          }

          if (comment.inline) {
            const inlineParts = [`  📎 Inline on: ${comment.inline.path}`];
            if (comment.inline.from !== undefined) {
              inlineParts.push(`(old L${comment.inline.from})`);
            }
            if (comment.inline.to !== undefined) {
              inlineParts.push(`(new L${comment.inline.to})`);
            }
            lines.push(inlineParts.join(' '));
          }

          // Show truncated content for list view
          const rawContent = comment.content.raw;
          const truncated = rawContent.length > 200 ? rawContent.substring(0, 200) + '...' : rawContent;
          lines.push(`  Content: ${truncated}`);
          lines.push(`  URL: ${comment.links.html.href}`);
          lines.push('---');

          return lines.join('\n');
        });

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${comments.length} comments on PR #${pull_request_id} in '${workspace}/${repo_slug}':\n\n${commentText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve comments for PR #${pull_request_id} in '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get a specific pull request comment
  server.tool(
    "get-pr-comment",
    "Get detailed information about a specific comment on a pull request",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      comment_id: z.number().describe("Comment ID"),
    },
    async ({ workspace, repo_slug, pull_request_id, comment_id }) => {
      try {
        const comment = await bitbucketAPI.getPullRequestComment(workspace, repo_slug, pull_request_id, comment_id);

        const commentInfo = [
          `# 💬 Comment #${comment.id} on PR #${pull_request_id}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Author:** ${comment.user.display_name} (@${comment.user.username})`,
          `**Created:** ${new Date(comment.created_on).toLocaleString()}`,
          `**Updated:** ${new Date(comment.updated_on).toLocaleString()}`,
          `**URL:** ${comment.links.html.href}`,
        ];

        if (comment.parent) {
          commentInfo.push(`**Reply to:** Comment #${comment.parent.id}`);
        }

        if (comment.inline) {
          commentInfo.push('', '## Inline Comment Details');
          commentInfo.push(`**File:** ${comment.inline.path}`);
          if (comment.inline.from !== undefined) {
            commentInfo.push(`**Old version line:** ${comment.inline.from}`);
          }
          if (comment.inline.to !== undefined) {
            commentInfo.push(`**New version line:** ${comment.inline.to}`);
          }
        }

        commentInfo.push('', '## Content', comment.content.raw);

        return {
          content: [
            {
              type: "text",
              text: commentInfo.join('\n'),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let helpMessage = '';

        if (errorMessage.includes('404')) {
          helpMessage = '\n\n**Troubleshooting:**\n- Verify the workspace, repository, pull request ID, and comment ID are correct\n- The comment may have been deleted';
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve comment #${comment_id} on PR #${pull_request_id} in '${workspace}/${repo_slug}': ${errorMessage}${helpMessage}`,
            },
          ],
        };
      }
    }
  );

  // Tool: List issues
  server.tool(
    "list-issues",
    "List issues for a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      state: z.enum(["new", "open", "resolved", "on hold", "invalid", "duplicate", "wontfix", "closed"]).optional().describe("Filter by issue state"),
      kind: z.enum(["bug", "enhancement", "proposal", "task"]).optional().describe("Filter by issue kind"),
    },
    async ({ workspace, repo_slug, state, kind }) => {
      try {
        const result = await bitbucketAPI.getIssues(workspace, repo_slug, state);
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
          return {
            content: [
              {
                type: "text",
                text: `No issues found in '${workspace}/${repo_slug}' matching the specified criteria.`,
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

        return {
          content: [
            {
              type: "text",
              text: `Found ${filteredIssues.length} issues in '${workspace}/${repo_slug}':\n\n${issueText.join("\n")}`,
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

  // Tool: List branches
  server.tool(
    "list-branches",
    "List branches for a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
    },
    async ({ workspace, repo_slug }) => {
      try {
        const result = await bitbucketAPI.getBranches(workspace, repo_slug);
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

        return {
          content: [
            {
              type: "text",
              text: `Found ${branches.length} branches in '${workspace}/${repo_slug}':\n\n${branchText.join("\n")}`,
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

  // Tool: Get recent commits
  server.tool(
    "get-commits",
    "Get recent commits for a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      branch: z.string().optional().describe("Branch name (defaults to main branch)"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Number of commits to retrieve (1-50, default: 10)"),
    },
    async ({ workspace, repo_slug, branch, limit }) => {
      try {
        const result = await bitbucketAPI.getCommits(workspace, repo_slug, branch);
        const commits = result.commits.slice(0, limit);

        if (commits.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No commits found in '${workspace}/${repo_slug}'${branch ? ` on branch '${branch}'` : ''}.`,
              },
            ],
          };
        }

        const commitText = commits.map((commit) => [
          `**${commit.hash.substring(0, 8)}** - ${commit.message.split('\n')[0]}`,
          `  Author: ${commit.author.user ? `${commit.author.user.display_name} (@${commit.author.user.username})` : commit.author.raw}`,
          `  Date: ${new Date(commit.date).toLocaleString()}`,
          `  URL: ${commit.links.html.href}`,
          commit.message.includes('\n') ? `  Full message: ${commit.message}` : '',
          "---",
        ].filter(line => line).join("\n"));

        return {
          content: [
            {
              type: "text",
              text: `Found ${commits.length} recent commits in '${workspace}/${repo_slug}'${branch ? ` on branch '${branch}'` : ''}:\n\n${commitText.join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve commits for '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Health check - test API connectivity
  server.tool(
    "health-check",
    "Check connectivity to Bitbucket API and validate credentials",
    {
      workspace: z.string().optional().describe("Optional workspace to test access"),
    },
    async ({ workspace }) => {
      try {
        const testWorkspace = workspace || "atlassian"; // Use Atlassian's public workspace as default

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

  // Tool: Universal search across repositories, pull requests, issues, and commits
  server.tool(
    "search",
    "Search across repositories, pull requests, issues, and commits in a workspace",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      query: z.string().min(1).describe("Search query (searches in titles, descriptions, and content)"),
      types: z.array(z.enum(["repositories", "pull-requests", "issues", "commits"])).optional().default(["repositories", "pull-requests", "issues"]).describe("Types of items to search"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum number of results per type"),
    },
    async ({ workspace, query, types, limit }) => {
      const searchResults: string[] = [];
      let totalResults = 0;

      try {
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

  // Tool: Get metrics and performance information
  server.tool(
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

  // Tool: Get pull request details
  server.tool(
    "get-pull-request",
    "Get detailed information about a specific pull request",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
    },
    async ({ workspace, repo_slug, pull_request_id }) => {
      try {
        const pr = await bitbucketAPI.getPullRequest(workspace, repo_slug, pull_request_id);

        const prInfo = [
          `# 🔀 Pull Request #${pr.id}: ${pr.title}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**State:** ${pr.state}`,
          `**Author:** ${pr.author.display_name} (@${pr.author.username})`,
          `**Created:** ${new Date(pr.created_on).toLocaleString()}`,
          `**Updated:** ${new Date(pr.updated_on).toLocaleString()}`,
          `**Source:** ${pr.source.repository.full_name}:${pr.source.branch.name}`,
          `**Destination:** ${pr.destination.repository.full_name}:${pr.destination.branch.name}`,
          `**URL:** ${pr.links.html.href}`,
        ];

        if (pr.description) {
          prInfo.push("", "## Description", pr.description);
        }

        return {
          content: [
            {
              type: "text",
              text: prInfo.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve pull request #${pull_request_id} from '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Update pull request
  server.tool(
    "update-pr-description",
    "Update the title and/or description of a pull request",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      title: z.string().optional().describe("New title for the pull request"),
      description: z.string().optional().describe("New description for the pull request"),
    },
    async ({ workspace, repo_slug, pull_request_id, title, description }) => {
      try {
        if (!title && description === undefined) {
          return {
            content: [
              {
                type: "text",
                text: "❌ You must provide at least one of 'title' or 'description' to update.",
              },
            ],
          };
        }

        // Check if authentication is available
        if (!process.env.BITBUCKET_API_TOKEN && (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Authentication required: Updating a pull request requires either BITBUCKET_API_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
              },
            ],
          };
        }

        const pr = await bitbucketAPI.updatePullRequest(workspace, repo_slug, pull_request_id, { title, description });

        const prInfo = [
          `✅ **Successfully updated PR #${pr.id}**`,
          "",
          `# 🔀 ${pr.title}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**State:** ${pr.state}`,
          `**Author:** ${pr.author.display_name} (@${pr.author.username})`,
          `**Updated:** ${new Date(pr.updated_on).toLocaleString()}`,
          `**URL:** ${pr.links.html.href}`,
        ];

        if (pr.description) {
          prInfo.push("", "## Description", pr.description);
        }

        return {
          content: [
            {
              type: "text",
              text: prInfo.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let helpMessage = "";

        if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify your BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are correct\n- Ensure the app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("403")) {
          helpMessage = "\n\n**Troubleshooting:**\n- You may not have permission to update this pull request\n- Ensure your app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("404")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify the workspace, repository, and pull request ID are correct\n- The pull request may not exist or may be private";
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update PR #${pull_request_id} from '${workspace}/${repo_slug}': ${errorMessage}${helpMessage}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get specific commit details
  server.tool(
    "get-commit",
    "Get detailed information about a specific commit in a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      commit_hash: z.string().min(7).describe("Commit hash (full 40-char or short 7+ char)"),
    },
    withRequestTracking("get-commit", async ({ workspace, repo_slug, commit_hash }) => {
      try {
        const commit = await bitbucketAPI.getCommit(workspace, repo_slug, commit_hash);
        const parentHashes = commit.parents.map((p) => p.hash.substring(0, 8)).join(", ") || "None";
        const author = commit.author.user
          ? `${commit.author.user.display_name} (@${commit.author.user.username})`
          : commit.author.raw;
        const commitInfo = [
          `# 💾 Commit ${commit.hash.substring(0, 8)}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Author:** ${author}`,
          `**Date:** ${new Date(commit.date).toISOString()}`,
          `**Parents:** ${parentHashes}`,
          `**URL:** ${commit.links.html.href}`,
          "",
          "## Message",
          commit.message,
        ].join("\n");
        return {
          content: [
            {
              type: "text",
              text: commitInfo,
            },
          ],
        };
      } catch (error) {
        let errorMessage = error instanceof Error ? error.message : String(error);
        if (/Invalid commit hash/.test(errorMessage)) {
          errorMessage +=
            "\n\n**Troubleshooting:**\n- Ensure the commit hash is correct and at least 7 hexadecimal characters.";
        } else if (/not found/.test(errorMessage)) {
          errorMessage +=
            `\n\n**Troubleshooting:**\n- The commit may not exist in this repository.\n- Check if the repository is private or you have access.`;
        }
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve commit: ${errorMessage}`,
            },
          ],
        };
      }
    })
  );
  // Tool: Create pull request
  server.tool(
    "create-pull-request",
    "Create a new pull request in a repository",
    {
      workspace: z.string().describe("Bitbucket workspace name"),
      repo_slug: z.string().describe("Repository slug/name"),
      title: z.string().min(1).describe("Title of the pull request"),
      source_branch: z.string().describe("Source branch name (the branch with your changes)"),
      destination_branch: z.string().optional().describe("Destination branch name (defaults to the repository's main branch)"),
      description: z.string().optional().describe("Description of the pull request (supports Markdown)"),
      close_source_branch: z.boolean().optional().describe("Whether to close the source branch after the PR is merged"),
      reviewers: z.array(z.string()).optional().describe("List of reviewer account UUIDs (e.g. '{account-uuid}')"),
    },
    async ({ workspace, repo_slug, title, source_branch, destination_branch, description, close_source_branch, reviewers }) => {
      try {
        // Auth guard — creating a PR always requires credentials
        if (!process.env.BITBUCKET_API_TOKEN && (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Authentication required: Creating a pull request requires either BITBUCKET_API_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
              },
            ],
          };
        }

        const pr = await bitbucketAPI.createPullRequest(workspace, repo_slug, {
          title,
          source_branch,
          destination_branch,
          description,
          close_source_branch,
          reviewers,
        });

        const successLines = [
          `✅ **Pull request created successfully!**`,
          "",
          `# 🔀 PR #${pr.id}: ${pr.title}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**State:** ${pr.state}`,
          `**Author:** ${pr.author.display_name} (@${pr.author.username})`,
          `**Source:** ${pr.source.branch.name}`,
          `**Destination:** ${pr.destination.branch.name}`,
          `**Created:** ${new Date(pr.created_on).toLocaleString()}`,
          `**URL:** ${pr.links.html.href}`,
        ];

        if (pr.description) {
          successLines.push("", "## Description", pr.description);
        }

        return {
          content: [
            {
              type: "text",
              text: successLines.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let helpMessage = "";

        if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify your credentials are correct\n- Ensure the token/app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("403")) {
          helpMessage = "\n\n**Troubleshooting:**\n- You may not have permission to create pull requests in this repository\n- Ensure your token/app password has 'Pull requests: Write' permission";
        } else if (errorMessage.includes("404")) {
          helpMessage = "\n\n**Troubleshooting:**\n- Verify the workspace, repository slug, and branch names are correct";
        } else if (errorMessage.includes("400")) {
          helpMessage = "\n\n**Troubleshooting:**\n- The source branch may not exist, or a pull request for this branch may already be open\n- Verify that source and destination branches are different";
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create pull request in '${workspace}/${repo_slug}': ${errorMessage}${helpMessage}`,
            },
          ],
        };
      }
    }
  );
}
