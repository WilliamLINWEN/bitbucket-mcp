import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import logger from "../debug-logger.js";
import { metricsCollector } from "../metrics.js";
import { resolveWorkspace } from "../validation.js";

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
      workspace: z.string().optional().describe("Bitbucket workspace name (username or team name). Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("Filter by user role"),
      sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("Sort repositories by"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    withRequestTracking("list-repositories", async ({ workspace: ws, role, sort, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
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

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${repositories.length} repositories in workspace '${workspace}':\n\n${repoText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
    },
    async ({ workspace: ws, repo_slug }) => {
      const workspace = resolveWorkspace(ws);
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      state: z.union([
        z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]),
        z.array(z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])),
      ]).optional().describe("Filter by PR state. Accepts a single state or an array of states: OPEN, MERGED, DECLINED, SUPERSEDED"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, state, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.getPullRequests(workspace, repo_slug, state, page, pagelen);
        const pullRequests = result.pullRequests;

        const stateList = state ? (Array.isArray(state) ? state : [state]) : [];
        const stateText = stateList.length > 0 ? ` with state [${stateList.join(', ')}]` : '';

        if (pullRequests.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No pull requests found in '${workspace}/${repo_slug}'${stateText}.`,
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

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${pullRequests.length} pull requests in '${workspace}/${repo_slug}':\n\n${prText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id }) => {
      const workspace = resolveWorkspace(ws);
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
    "Create a comment on a pull request, or reply to an existing comment by specifying a parent comment ID",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      content: z.string().min(1).describe("Comment content in plain text"),
      file_path: z.string().optional().describe("Path to the file for inline comments"),
      from_line: z.number().optional().describe("Line number in the old version of the file (for inline comments)"),
      to_line: z.number().optional().describe("Line number in the new version of the file (for inline comments)"),
      parent_id: z.number().optional().describe("ID of the parent comment to reply to"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id, content, file_path, from_line, to_line, parent_id }) => {
      const workspace = resolveWorkspace(ws);
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
          inlineOptions,
          parent_id
        );

        // Build the success message
        const successLines = [
          parent_id
            ? `✅ **Reply created successfully on PR #${pull_request_id}**`
            : `✅ **Comment created successfully on PR #${pull_request_id}**`,
          "",
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Comment ID:** ${comment.id}`,
        ];

        if (parent_id) {
          successLines.push(`**Reply to:** Comment #${parent_id}`);
        }

        successLines.push(
          `**Author:** ${comment.user.display_name} (@${comment.user.username})`,
          `**Created:** ${new Date(comment.created_on).toLocaleString()}`,
          `**URL:** ${comment.links.html.href}`,
        );

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
          helpMessage = parent_id
            ? "\n\n**Troubleshooting:**\n- Verify the workspace, repository, and pull request ID are correct\n- The parent comment ID may be invalid — ensure the comment exists on this PR\n- The pull request may not exist or may be private"
            : "\n\n**Troubleshooting:**\n- Verify the workspace, repository, and pull request ID are correct\n- The pull request may not exist or may be private";
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      comment_id: z.number().describe("Comment ID"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id, comment_id }) => {
      const workspace = resolveWorkspace(ws);
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

  // Tool: List branches
  server.tool(
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

  // Tool: Get recent commits
  server.tool(
    "get-commits",
    "Get recent commits for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      branch: z.string().optional().describe("Branch name (defaults to main branch)"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, branch, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.getCommits(workspace, repo_slug, branch, page, pagelen);
        const commits = result.commits;

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

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${commits.length} recent commits in '${workspace}/${repo_slug}'${branch ? ` on branch '${branch}'` : ''}:\n\n${commitText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
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

  // Tool: Universal search across repositories, pull requests, issues, and commits
  server.tool(
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id }) => {
      const workspace = resolveWorkspace(ws);
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pull_request_id: z.number().describe("Pull request ID"),
      title: z.string().optional().describe("New title for the pull request"),
      description: z.string().optional().describe("New description for the pull request"),
    },
    async ({ workspace: ws, repo_slug, pull_request_id, title, description }) => {
      const workspace = resolveWorkspace(ws);
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      commit_hash: z.string().min(7).describe("Commit hash (full 40-char or short 7+ char)"),
    },
    withRequestTracking("get-commit", async ({ workspace: ws, repo_slug, commit_hash }) => {
      const workspace = resolveWorkspace(ws);
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
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      title: z.string().min(1).describe("Title of the pull request"),
      source_branch: z.string().describe("Source branch name (the branch with your changes)"),
      destination_branch: z.string().optional().describe("Destination branch name (defaults to the repository's main branch)"),
      description: z.string().optional().describe("Description of the pull request (supports Markdown)"),
      close_source_branch: z.boolean().optional().describe("Whether to close the source branch after the PR is merged"),
      reviewers: z.array(z.string()).optional().describe("List of reviewer account UUIDs (e.g. '{account-uuid}')"),
    },
    async ({ workspace: ws, repo_slug, title, source_branch, destination_branch, description, close_source_branch, reviewers }) => {
      const workspace = resolveWorkspace(ws);
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

  // Tool: List pipelines
  server.tool(
    "list-pipelines",
    "List pipelines for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      page: z.string().optional().describe("Page number or next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.listPipelines(workspace, repo_slug, page, pagelen);
        const pipelines = result.pipelines;

        if (pipelines.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No pipelines found for repository '${workspace}/${repo_slug}'.`,
              },
            ],
          };
        }

        const pipelineText = pipelines.map((p) => [
          `**Pipeline #${p.build_number}** (${p.uuid})`,
          `  Status: ${p.state?.name || "unknown"}${p.state?.result ? ` | Result: ${p.state.result.name}` : ""}`,
          `  Target: ${p.target?.ref_type || "commit"} ${p.target?.ref_name || p.target?.commit?.hash?.substring(0, 7) || "unknown"}`,
          p.trigger ? `  Trigger: ${p.trigger.name || p.trigger.type}` : null,
          p.variables && p.variables.length > 0
            ? `  Variables: ${p.variables.map(v => v.secured ? `${v.key}=***` : `${v.key}=${v.value ?? ""}`).join(", ")}`
            : null,
          `  Creator: ${p.creator?.display_name || "unknown"} (@${p.creator?.username || "unknown"})`,
          `  Created: ${p.created_on ? new Date(p.created_on).toLocaleString() : "unknown"}`,
          p.completed_on ? `  Completed: ${new Date(p.completed_on).toLocaleString()}` : null,
          p.build_seconds_used !== undefined ? `  Duration: ${Math.floor(p.build_seconds_used / 60)}m ${p.build_seconds_used % 60}s` : null,
          `  URL: ${p.links?.html?.href || "N/A"}`,
          "---",
        ].filter(Boolean).join("\n"));

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${pipelines.length} pipelines for '${workspace}/${repo_slug}':\n\n${pipelineText.join("\n")}${paginationText ? `\n\n${paginationText}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve pipelines: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get pipeline
  server.tool(
    "get-pipeline",
    "Get details of a specific pipeline by UUID",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("UUID of the pipeline to retrieve"),
    },
    async ({ workspace: ws, repo_slug, pipeline_uuid }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const pipeline = await bitbucketAPI.getPipeline(workspace, repo_slug, pipeline_uuid);

        const info = [
          `**Pipeline #${pipeline.build_number}** (${pipeline.uuid})`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Status:** ${pipeline.state?.name || "unknown"}${pipeline.state?.result?.name ? ` (${pipeline.state.result.name})` : ""}`,
          `**Created:** ${new Date(pipeline.created_on).toLocaleString()}`,
          pipeline.completed_on ? `**Completed:** ${new Date(pipeline.completed_on).toLocaleString()}` : null,
          pipeline.build_seconds_used !== undefined ? `**Duration:** ${pipeline.build_seconds_used} seconds` : null,
          `**URL:** ${pipeline.links?.html?.href || "N/A"}`
        ].filter(Boolean);

        return {
          content: [
            {
              type: "text",
              text: info.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("tool-handler", `Failed to execute get-pipeline tool: ${errorMessage}`, {
          workspace,
          workspace_input: ws,
          repo_slug,
          pipeline_uuid
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve pipeline: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Trigger pipeline
  server.tool(
    "trigger-pipeline",
    "Trigger a new pipeline for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      ref_type: z.enum(["branch", "tag"]).optional().describe("Type of reference (branch or tag)"),
      ref_name: z.string().optional().describe("Name of the branch or tag"),
      commit_hash: z.string().optional().describe("Full hash of the commit to run the pipeline on"),
      selector_type: z.string().optional().describe("Type of selector (e.g., 'custom', 'default')"),
      selector_pattern: z.string().optional().describe("Pattern for the selector (e.g., custom pipeline name)"),
      variables: z.record(z.string(), z.string()).optional().describe("Environment variables for the pipeline (key-value pairs)"),
    },
    async ({ workspace: ws, repo_slug, ref_type, ref_name, commit_hash, selector_type, selector_pattern, variables }) => {
      const workspace = resolveWorkspace(ws);
      try {
        // Check if authentication is available for triggering pipelines
        if (!process.env.BITBUCKET_API_TOKEN && (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Authentication required: Triggering a pipeline requires either BITBUCKET_API_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
              },
            ],
          };
        }

        // Validation: Must have either (ref_type + ref_name) OR commit_hash
        if (!(ref_type && ref_name) && !commit_hash) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Invalid parameters: You must provide either both (ref_type and ref_name) or a commit_hash to trigger a pipeline.",
              },
            ],
          };
        }

        // Validation: Selector must have both type and pattern if either is provided
        if ((selector_type && !selector_pattern) || (!selector_type && selector_pattern)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Invalid parameters: When using a selector, you must provide both 'selector_type' and 'selector_pattern'.",
              },
            ],
          };
        }

        const formattedVariables = variables ? Object.entries(variables).map(([key, value]) => ({ key, value })) : undefined;

        const pipeline = await bitbucketAPI.triggerPipeline(workspace, repo_slug, {
          ref_type: ref_type as 'branch' | 'tag',
          ref_name,
          commit_hash,
          selector_type,
          selector_pattern,
          variables: formattedVariables,
        });

        const info = [
          `✅ **Pipeline triggered successfully!**`,
          "",
          `**Pipeline #${pipeline.build_number}** (${pipeline.uuid})`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Status:** ${pipeline.state?.name || "unknown"}`,
          pipeline.trigger ? `**Trigger:** ${pipeline.trigger.name || pipeline.trigger.type}` : null,
          pipeline.variables && pipeline.variables.length > 0
            ? `**Variables:** ${pipeline.variables.map(v => v.secured ? `${v.key}=***` : `${v.key}=${v.value ?? ""}`).join(", ")}`
            : null,
          `**Created:** ${pipeline.created_on ? new Date(pipeline.created_on).toLocaleString() : "unknown"}`,
          `**URL:** ${pipeline.links?.html?.href || "N/A"}`,
        ].filter(Boolean);

        return {
          content: [
            {
              type: "text",
              text: info.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to trigger pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: List pipeline steps
  server.tool(
    "list-pipeline-steps",
    "List steps for a specific pipeline",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("UUID of the pipeline"),
      page: z.string().optional().describe("Page number or opaque next page URL returned by Bitbucket pagination"),
      pagelen: z.number().int().min(10).max(100).optional().describe("Number of items per page (default: 10, min: 10, max: 100)"),
    },
    async ({ workspace: ws, repo_slug, pipeline_uuid, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const result = await bitbucketAPI.listPipelineSteps(workspace, repo_slug, pipeline_uuid, page, pagelen);
        const steps = result.steps;

        if (steps.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No steps found for pipeline '${pipeline_uuid}' in '${workspace}/${repo_slug}'.`,
              },
            ],
          };
        }

        const stepText = steps.map((s) => [
          `**Step: ${s.name || "unnamed"}** (${s.uuid})`,
          `  Status: ${s.state?.name || "unknown"}${s.state?.result ? ` | Result: ${s.state.result.name}` : ""}`,
          s.image ? `  Image: ${s.image.name}` : null,
          s.started_on ? `  Started: ${new Date(s.started_on).toLocaleString()}` : null,
          s.completed_on ? `  Completed: ${new Date(s.completed_on).toLocaleString()}` : null,
          s.duration_in_seconds !== undefined ? `  Duration: ${s.duration_in_seconds}s` : null,
        ].filter(Boolean).join("\n")).join("\n---\n");

        const paginationText = [
          result.page !== undefined ? `Page: ${result.page}` : null,
          result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
          result.next ? `Next page: ${result.next}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Found ${steps.length} steps for pipeline '${pipeline_uuid}' in '${workspace}/${repo_slug}':\n\n${stepText}${paginationText ? `\n\n${paginationText}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve pipeline steps: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get pipeline step
  server.tool(
    "get-pipeline-step",
    "Get details of a specific step in a pipeline",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("UUID of the pipeline"),
      step_uuid: z.string().describe("UUID of the step to retrieve"),
    },
    async ({ workspace: ws, repo_slug, pipeline_uuid, step_uuid }) => {
      const workspace = resolveWorkspace(ws);
      try {
        const step = await bitbucketAPI.getPipelineStep(workspace, repo_slug, pipeline_uuid, step_uuid);

        const info = [
          `**Step: ${step.name || "unnamed"}** (${step.uuid})`,
          `**Pipeline:** ${pipeline_uuid}`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Status:** ${step.state?.name || "unknown"}${step.state?.result?.name ? ` (${step.state.result.name})` : ""}`,
          step.image ? `**Image:** ${step.image.name}` : null,
          step.started_on ? `**Started:** ${new Date(step.started_on).toLocaleString()}` : null,
          step.completed_on ? `**Completed:** ${new Date(step.completed_on).toLocaleString()}` : null,
          step.duration_in_seconds !== undefined ? `**Duration:** ${step.duration_in_seconds} seconds` : null,
          step.build_seconds_used !== undefined ? `**Build seconds used:** ${step.build_seconds_used}` : null,
          step.max_time !== undefined ? `**Max time:** ${step.max_time} seconds` : null,
          step.trigger ? `**Trigger:** ${step.trigger.type}` : null,
          step.links?.log_file?.href ? `**Log URL:** ${step.links.log_file.href}` : null,
        ].filter(Boolean);

        return {
          content: [
            {
              type: "text",
              text: info.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("tool-handler", `Failed to execute get-pipeline-step tool: ${errorMessage}`, {
          workspace,
          repo_slug,
          pipeline_uuid,
          step_uuid
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve pipeline step: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Tool: Get pipeline step log
  server.tool(
    "get-pipeline-step-log",
    "Get the log output for a specific step in a pipeline",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("UUID of the pipeline"),
      step_uuid: z.string().describe("UUID of the step"),
    },
    async ({ workspace: ws, repo_slug, pipeline_uuid, step_uuid }) => {
      const workspace = resolveWorkspace(ws);
      try {
        let log = await bitbucketAPI.getPipelineStepLog(workspace, repo_slug, pipeline_uuid, step_uuid);

        const MAX_LOG_SIZE = 100 * 1024; // 100KB
        let truncated = false;
        if (log.length > MAX_LOG_SIZE) {
          log = log.slice(-MAX_LOG_SIZE);
          truncated = true;
        }

        const header = [
          `**Pipeline Step Log**`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Pipeline:** ${pipeline_uuid}`,
          `**Step:** ${step_uuid}`,
          truncated ? `\n⚠️ Log truncated to last 100KB (original size exceeded limit)\n` : "",
          "---",
          "",
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: header + log,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("tool-handler", `Failed to execute get-pipeline-step-log tool: ${errorMessage}`, {
          workspace,
          repo_slug,
          pipeline_uuid,
          step_uuid
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to retrieve pipeline step log: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );
}
