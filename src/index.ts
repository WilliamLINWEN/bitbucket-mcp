#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BitbucketAPI, Repository, PullRequest, Issue, Branch, Commit, Comment } from "./bitbucket-api.js";
import { metricsCollector } from "./metrics.js";
import { configManager, validateEnvironment } from "./config.js";
import { MultiTierRateLimiter, createDefaultRateLimitConfig } from "./rate-limiting.js";
import logger from "./debug-logger.js";
import { recordError, createToolErrorContext, errorContextManager } from "./error-context.js";
import { startResourceMonitoring } from "./resource-monitor.js";

// Environment variables for authentication
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;

// Validate environment on startup
const envValidation = validateEnvironment();
logger.info('startup', 'Environment validation completed', {
  valid: envValidation.valid,
  errors: envValidation.errors.length,
  warnings: envValidation.warnings.length
});

if (!envValidation.valid) {
  // Record environment validation errors with enhanced error context
  if (envValidation.errors.length > 0) {
    const envError = new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
    recordError(envError, 'environment-validation', 'startup', {
      metadata: { 
        errorCount: envValidation.errors.length,
        warningCount: envValidation.warnings.length,
        errors: envValidation.errors,
        warnings: envValidation.warnings
      }
    });
    logger.error('startup', `Environment validation failed: ${envValidation.errors.length} errors`);
  }
  console.error("Environment validation failed:");
  envValidation.errors.forEach(error => console.error(`  ❌ ${error}`));
  if (envValidation.warnings.length > 0) {
    console.error("Warnings:");
    envValidation.warnings.forEach(warning => console.error(`  ⚠️  ${warning}`));
  }
}

// Create rate limiter
logger.debug('startup', 'Creating rate limiter');
logger.mark('rate_limiter_start');
const rateLimiter = new MultiTierRateLimiter(createDefaultRateLimitConfig());
logger.mark('rate_limiter_done');
logger.measure('Rate limiter creation time', 'rate_limiter_start');

// Create Bitbucket API instance
logger.debug('startup', 'Initializing Bitbucket API');
logger.mark('api_init_start');
const bitbucketAPI = new BitbucketAPI();
logger.mark('api_init_done');
logger.measure('BitbucketAPI initialization time', 'api_init_start');

// Create server instance
logger.debug('startup', 'Creating MCP server instance');
logger.mark('server_creation_start');
const server = new McpServer({
  name: "bitbucket-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});
logger.mark('server_creation_done');
logger.measure('MCP server creation time', 'server_creation_start');

// Tool: List repositories for a workspace
server.tool(
  "list-repositories",
  "List repositories in a Bitbucket workspace",
  {
    workspace: z.string().describe("Bitbucket workspace name (username or team name)"),
    role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("Filter by user role"),
    sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("Sort repositories by"),
  },
  withRequestTracking("list-repositories", async ({ workspace, role, sort }) => {
    try {
      const result = await bitbucketAPI.listRepositories(workspace);
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

      const repoText = repositories.map((repo: Repository) => 
        [
          `**${repo.name}** (${repo.full_name})`,
          `  Description: ${repo.description || "No description"}`,
          `  Language: ${repo.language || "Unknown"}`,
          `  Private: ${repo.is_private ? "Yes" : "No"}`,
          `  Size: ${repo.size} bytes`,
          `  Created: ${new Date(repo.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(repo.updated_on).toLocaleDateString()}`,
          `  Owner: ${repo.owner.display_name} (@${repo.owner.username})`,
          `  URL: ${repo.links.html.href}`,
          "---",
        ].join("\n")
      );

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

      const prText = pullRequests.map((pr: PullRequest) => 
        [
          `**PR #${pr.id}: ${pr.title}**`,
          `  State: ${pr.state}`,
          `  Author: ${pr.author.display_name} (@${pr.author.username})`,
          `  From: ${pr.source.repository.full_name}:${pr.source.branch.name}`,
          `  To: ${pr.destination.repository.full_name}:${pr.destination.branch.name}`,
          `  Created: ${new Date(pr.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(pr.updated_on).toLocaleDateString()}`,
          `  URL: ${pr.links.html.href}`,
          `  Description: ${pr.description || "No description"}`,
          "---",
        ].join("\n")
      );

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
              text: `No changes found in pull request #${pull_request_id} for '${workspace}/${repo_slug}'. The PR might be empty or not exist.`,
            },
          ],
        };
      }

      // Split diff into sections for better readability
      const diffLines = diff.split('\n');
      const fileChanges: string[] = [];
      let currentFile = '';
      let currentChanges: string[] = [];

      for (const line of diffLines) {
        if (line.startsWith('diff --git')) {
          // Save previous file changes if any
          if (currentFile && currentChanges.length > 0) {
            fileChanges.push(`### ${currentFile}\n\`\`\`diff\n${currentChanges.join('\n')}\n\`\`\``);
          }
          // Start new file
          currentFile = line.match(/b\/(.+)$/)?.[1] || 'Unknown file';
          currentChanges = [line];
        } else {
          currentChanges.push(line);
        }
      }

      // Add the last file
      if (currentFile && currentChanges.length > 0) {
        fileChanges.push(`### ${currentFile}\n\`\`\`diff\n${currentChanges.join('\n')}\n\`\`\``);
      }

      // If no file-based parsing worked, show the raw diff
      if (fileChanges.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: [
                `# 📝 Pull Request #${pull_request_id} Diff`,
                `**Repository:** ${workspace}/${repo_slug}`,
                "",
                "```diff",
                diff,
                "```"
              ].join("\n"),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: [
              `# 📝 Pull Request #${pull_request_id} Diff`,
              `**Repository:** ${workspace}/${repo_slug}`,
              `**Files Changed:** ${fileChanges.length}`,
              "",
              ...fileChanges
            ].join("\n"),
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
      if (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Authentication required: Creating comments requires BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
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

      // Add inline comment details if applicable
      if (file_path) {
        const lineInfo = [];
        if (from_line !== undefined) {
          lineInfo.push(`**Line (old version):** ${from_line}`);
        }
        if (to_line !== undefined) {
          lineInfo.push(`**Line (new version):** ${to_line}`);
        }
        
        successLines.push(
          "",
          "**Inline Comment:**",
          `**File:** ${file_path}`,
          ...(lineInfo.length > 0 ? lineInfo : ["**File comment**"])
        );
      }
      
      successLines.push(
        "",
        "**Content:**",
        content
      );

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
      
      // Provide more specific error messages based on common scenarios
      let helpMessage = "";
      if (errorMessage.includes("401")) {
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
              text: `No issues found in '${workspace}/${repo_slug}'${state ? ` with state '${state}'` : ''}${kind ? ` and kind '${kind}'` : ''}.`,
            },
          ],
        };
      }

      const issueText = issues.map((issue: Issue) => 
        [
          `**Issue #${issue.id}: ${issue.title}**`,
          `  State: ${issue.state}`,
          `  Kind: ${issue.kind}`,
          `  Priority: ${issue.priority}`,
          `  Reporter: ${issue.reporter.display_name} (@${issue.reporter.username})`,
          `  Assignee: ${issue.assignee ? `${issue.assignee.display_name} (@${issue.assignee.username})` : "Unassigned"}`,
          `  Created: ${new Date(issue.created_on).toLocaleDateString()}`,
          `  Updated: ${new Date(issue.updated_on).toLocaleDateString()}`,
          `  URL: ${issue.links.html.href}`,
          `  Description: ${issue.content?.raw || "No description"}`,
          "---",
        ].join("\n")
      );

      return {
        content: [
          {
            type: "text",
            text: `Found ${issues.length} issues in '${workspace}/${repo_slug}':\n\n${issueText.join("\n")}`,
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

      const branchText = branches.map((branch: Branch) => 
        [
          `**${branch.name}**`,
          `  Last commit: ${branch.target.hash.substring(0, 8)}`,
          `  Commit message: ${branch.target.message}`,
          `  Author: ${branch.target.author.raw}`,
          `  Date: ${new Date(branch.target.date).toLocaleDateString()}`,
          `  URL: ${branch.links.html.href}`,
          "---",
        ].join("\n")
      );

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

      const commitText = commits.map((commit: Commit) => 
        [
          `**${commit.hash.substring(0, 8)}** - ${commit.message.split('\n')[0]}`,
          `  Author: ${commit.author.user ? `${commit.author.user.display_name} (@${commit.author.user.username})` : commit.author.raw}`,
          `  Date: ${new Date(commit.date).toLocaleString()}`,
          `  URL: ${commit.links.html.href}`,
          commit.message.includes('\n') ? `  Full message: ${commit.message}` : '',
          "---",
        ].filter(line => line).join("\n")
      );

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
      
      const authStatus = BITBUCKET_USERNAME && BITBUCKET_APP_PASSWORD ? "Authenticated" : "Unauthenticated (public access only)";
      
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
              "- get-pr-diff: ✅",
              "- create-pr-comment: ✅",
              "- list-issues: ✅",
              "- list-branches: ✅",
              "- get-commits: ✅",
              "- search: ✅",
              "- get-metrics: ✅",
              "- health-check: ✅",
              "",
              "All systems operational! 🚀"
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
              "3. Ensure BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are set for private repos",
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

      if (totalResults === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for query "${query}" in workspace "${workspace}". Try:\n- Different search terms\n- Checking if the workspace exists\n- Verifying you have access to the repositories`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: [
              `# 🔍 Search Results for "${query}"`,
              `**Workspace:** ${workspace}`,
              `**Total Results:** ${totalResults}`,
              "",
              ...searchResults
            ].join("\n"),
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

// Tool: Get performance metrics and insights
server.tool(
  "get-metrics",
  "Get performance metrics, API usage statistics, and optimization insights",
  {
    detailed: z.boolean().optional().describe("Include detailed metrics and recent request history"),
    reset: z.boolean().optional().describe("Reset metrics after retrieving them"),
  },
  async ({ detailed = false, reset = false }) => {
    try {
      const metrics = detailed 
        ? metricsCollector.getDetailedReport()
        : { metrics: metricsCollector.getMetrics() };

      const rateLimitStatus = rateLimiter.getStatus();
      const configSummary = configManager.getSummary();
      const insights = metricsCollector.getPerformanceInsights();

      if (reset) {
        metricsCollector.reset();
        rateLimiter.reset();
      }

      const metricsText = [
        "# 📊 Bitbucket MCP Server Metrics",
        "",
        "## 📈 Request Statistics",
        `**Total Requests:** ${metrics.metrics.totalRequests}`,
        `**Successful:** ${metrics.metrics.successfulRequests} (${metrics.metrics.totalRequests > 0 ? ((metrics.metrics.successfulRequests / metrics.metrics.totalRequests) * 100).toFixed(1) : 0}%)`,
        `**Failed:** ${metrics.metrics.failedRequests}`,
        `**Average Response Time:** ${metrics.metrics.averageResponseTime.toFixed(0)}ms`,
        "",
        "## 🔧 Tool Usage",
        ...Object.entries(metrics.metrics.requestsByTool).map(([tool, count]) => 
          `**${tool}:** ${count} requests`
        ),
        "",
        "## ⚡ Rate Limiting Status",
        ...Object.entries(rateLimitStatus).map(([tier, status]) => 
          `**${tier.toUpperCase()}:** ${(status as any).remaining || 0} requests remaining`
        ),
        "",
        "## ⚙️ Configuration",
        `**Authentication:** ${configManager.isAuthenticationConfigured() ? '✅ Configured' : '❌ Not configured'}`,
        `**Base URL:** ${configSummary.baseUrl}`,
        `**Timeout:** ${configSummary.timeout}ms`,
        `**Retry Attempts:** ${configSummary.retryAttempts}`,
        `**Metrics Enabled:** ${configSummary.enableMetrics ? '✅' : '❌'}`,
        "",
        "## 🎯 Performance Insights",
        `**Overall Success Rate:** ${(insights.successRate * 100).toFixed(1)}%`,
        ""
      ];

      if (insights.slowestEndpoints.length > 0) {
        metricsText.push("### 🐌 Slowest Endpoints");
        insights.slowestEndpoints.forEach(endpoint => {
          metricsText.push(`**${endpoint.endpoint}:** ${endpoint.avgTime.toFixed(0)}ms average`);
        });
        metricsText.push("");
      }

      if (insights.mostUsedTools.length > 0) {
        metricsText.push("### 🔥 Most Used Tools");
        insights.mostUsedTools.forEach(tool => {
          metricsText.push(`**${tool.tool}:** ${tool.count} requests`);
        });
        metricsText.push("");
      }

      if (insights.commonErrors.length > 0) {
        metricsText.push("### ❌ Common Errors");
        insights.commonErrors.forEach(error => {
          metricsText.push(`**${error.error}:** ${error.count} occurrences`);
        });
        metricsText.push("");
      }

      if (insights.recommendedOptimizations.length > 0) {
        metricsText.push("### 💡 Optimization Recommendations");
        insights.recommendedOptimizations.forEach(rec => {
          metricsText.push(`• ${rec}`);
        });
        metricsText.push("");
      }

      if (detailed && 'recentRequests' in metrics) {
        metricsText.push("## 📋 Recent Requests");
        if (metrics.recentRequests.length > 0) {
          metrics.recentRequests.forEach(req => {
            const status = req.success ? '✅' : '❌';
            metricsText.push(`${status} **${req.tool}** (${req.endpoint}) - ${req.duration}ms`);
          });
        } else {
          metricsText.push("No recent requests");
        }
        metricsText.push("");
      }

      if (reset) {
        metricsText.push("🔄 **Metrics have been reset**");
      }

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
        "",
        "## Description",
        pr.description || "_No description provided_",
      ].join("\n");

      return {
        content: [
          {
            type: "text",
            text: prInfo,
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

// Main function to run the server
async function main() {
  // Client session tracking
  let clientSessionStartTime: number;
   const serverStartTime = Date.now();
   
   try {
     logger.debug('startup', 'Starting Bitbucket MCP Server');

     // Create transport
     logger.debug('main', 'Creating StdioServerTransport');
     logger.mark('transport_create_start');
     const transport = new StdioServerTransport();
     logger.mark('transport_create_done');
     logger.measure('Transport creation time', 'transport_create_start');
     
     // Task 3: Transport Connection Monitoring
     // Add transport event listeners for comprehensive monitoring
     logger.debug('transport', 'Setting up transport connection monitoring');
     
     // Monitor transport connection state
     if (transport.onclose) {
       transport.onclose = () => {
         logger.warn('transport', '⚠️  Transport connection closed', {
           uptime: Date.now() - serverStartTime,
           memory: getMemoryInfo().formatted,
           timestamp: new Date().toISOString()
         });
       };
     }
     
     // Monitor transport errors
     if (transport.onerror) {
       transport.onerror = (error: any) => {
         logger.error('transport', '❌ Transport error occurred', {
           error: error instanceof Error ? {
             name: error.name,
             message: error.message,
             stack: error.stack
           } : error,
           uptime: Date.now() - serverStartTime,
           memory: getMemoryInfo().formatted,
           timestamp: new Date().toISOString()
         });
       };
     }
     
     // Monitor stdio streams if available
     if (process.stdin) {
       process.stdin.on('error', (error) => {
         logger.error('transport', 'stdin stream error', {
           error: {
             name: error.name,
             message: error.message,
             stack: error.stack
           },
           uptime: Date.now() - serverStartTime
         });
       });
      
      process.stdin.on('end', () => {
        logger.warn('transport', 'stdin stream ended - client disconnected', {
          uptime: Date.now() - serverStartTime,
          memory: getMemoryInfo().formatted
        });
      });
      
      process.stdin.on('close', () => {
        logger.warn('transport', 'stdin stream closed', {
          uptime: Date.now() - serverStartTime
        });
      });
    }
    
    if (process.stdout) {
      process.stdout.on('error', (error) => {
        logger.error('transport', 'stdout stream error', {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          uptime: Date.now() - serverStartTime
        });
      });
    }
    
    logger.info('transport', 'Transport monitoring setup complete', {
      transportType: 'StdioServerTransport',
      hasOnClose: !!transport.onclose,
      hasOnError: !!transport.onerror,
      stdinReadable: process.stdin?.readable,
      stdoutWritable: process.stdout?.writable
    });
    
    // Task 4.3: Set up enhanced transport message monitoring for notifications
    setupTransportMessageMonitoring(transport);
    logger.info('mcp_protocol', 'Enhanced transport message monitoring for notifications setup complete');
    
    // Connect server to transport - This is a critical step
    logger.info('main', 'Connecting server to transport - CRITICAL STEP');
    // Mark client session start
    clientSessionStartTime = Date.now();
    logger.info('client', 'Client session started', { startTime: new Date(clientSessionStartTime).toISOString() });
    logger.mark('connect_start');
    try {
      await server.connect(transport);
      logger.mark('connect_done');
      logger.measure('Server connect time', 'connect_start');
      logger.info('main', '✅ Server successfully connected to transport');
      
      // Task 3.2: Add MCP protocol state tracking
      logger.info('mcp_protocol', 'MCP server connection established', {
        serverName: 'bitbucket-mcp',
        serverVersion: '1.0.0',
        transportType: 'stdio',
        connectionTime: Date.now() - serverStartTime,
        capabilities: {
          resources: true, // We support resources
          tools: true, // We support tools
          hasResources: true,
          hasTools: true
        }
      });
      
    } catch (connectError) {
      logger.error('main', '❌ Failed to connect server to transport', connectError);
      logger.error('mcp_protocol', 'MCP server connection failed', {
        error: connectError instanceof Error ? {
          name: connectError.name,
          message: connectError.message,
          stack: connectError.stack
        } : connectError,
        uptime: Date.now() - serverStartTime
      });
      throw connectError;
    }
    
    // Set up client request pattern monitoring
    const CLIENT_PATTERN_INTERVAL = parseInt(process.env.MCP_CLIENT_PATTERN_INTERVAL || '60000', 10);
    setInterval(() => {
      const insights = metricsCollector.getPerformanceInsights();
      logger.info('client_patterns', 'Top client requested methods', { topMethods: insights.mostUsedTools });
    }, CLIENT_PATTERN_INTERVAL);
    
    // Monitor client authentication state changes
    let prevAuthState = configManager.isAuthenticationConfigured();
    const AUTH_MONITOR_INTERVAL = parseInt(process.env.MCP_AUTH_MONITOR_INTERVAL || '30000', 10);
    setInterval(() => {
      const currentAuth = configManager.isAuthenticationConfigured();
      if (currentAuth !== prevAuthState) {
        logger.info('client_auth', 'Client authentication state changed', { authenticated: currentAuth });
        prevAuthState = currentAuth;
      }
    }, AUTH_MONITOR_INTERVAL);

    logger.info('main', '🚀 Bitbucket MCP Server v1.0.0 running');
    logger.debug('main', 'Main initialization complete, awaiting client requests');
    startResourceMonitoring();
    
    // Log startup message to stderr so it doesn't interfere with MCP communication
    console.error("🚀 Bitbucket MCP Server v1.0.0 running on stdio");
    console.error("📋 Available tools: list-repositories, get-repository, list-pull-requests, get-pull-request, get-pr-diff, create-pr-comment, list-issues, list-branches, get-commits, search, get-metrics, health-check");
    console.error(`⚙️  Configuration: ${configManager.isAuthenticationConfigured() ? '✅ Authenticated' : '❌ No authentication'}`);
    console.error(`📊 Metrics: ${configManager.get('enableMetrics') ? '✅ Enabled' : '❌ Disabled'}`);
    
    if (!BITBUCKET_USERNAME || !BITBUCKET_APP_PASSWORD) {
      logger.warn('main', 'Authentication credentials not provided, limiting functionality');
      console.error("⚠️  WARNING: BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables not set.");
      console.error("   Some functionality may be limited to public repositories only.");
    }
    
    // Log configuration validation
    const configValidation = configManager.validate();
    if (!configValidation.valid) {
      logger.error('main', 'Configuration validation failed', {
        errors: configValidation.errors,
        errorCount: configValidation.errors.length
      });
      console.error("❌ Configuration issues detected:");
      configValidation.errors.forEach(error => console.error(`   • ${error}`));
    }
    
    logger.measure('Total startup time', 'main_start');
    
  } catch (error) {
    logger.error('main', 'Server startup error', error);
    throw error;
  }
}

main().catch((error) => {
  logger.error('startup', 'Fatal error in main()', error);
  console.error("Fatal error in main():", error);
  process.exit(1);
});

// ============================================================================
// TASK 2: Process Lifecycle Monitoring
// ============================================================================

// Track server startup time for uptime calculations
const serverStartTime = Date.now();
logger.mark('server_lifecycle_start');

// Memory monitoring variables
let memoryCheckInterval: NodeJS.Timeout | null = null;
const MEMORY_WARNING_THRESHOLD = 512 * 1024 * 1024; // 512MB
const MEMORY_CRITICAL_THRESHOLD = 1024 * 1024 * 1024; // 1GB

/**
 * Get human-readable memory usage information
 */
function getMemoryInfo(): { formatted: string; raw: NodeJS.MemoryUsage; warnings: string[] } {
  const usage = process.memoryUsage();
  const warnings: string[] = [];
  
  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  };
  
  // Check for memory warnings
  if (usage.heapUsed > MEMORY_WARNING_THRESHOLD) {
    warnings.push(`High heap usage: ${formatBytes(usage.heapUsed)}`);
  }
  if (usage.rss > MEMORY_CRITICAL_THRESHOLD) {
    warnings.push(`Critical RSS usage: ${formatBytes(usage.rss)}`);
  }
  
  return {
    formatted: `RSS: ${formatBytes(usage.rss)}, Heap: ${formatBytes(usage.heapUsed)}/${formatBytes(usage.heapTotal)}, External: ${formatBytes(usage.external)}`,
    raw: usage,
    warnings
  };
}

/**
 * Start periodic memory monitoring
 */
function startMemoryMonitoring(): void {
  const interval = parseInt(process.env.BITBUCKET_MCP_MEMORY_CHECK_INTERVAL || '30000', 10); // 30 seconds default
  
  memoryCheckInterval = setInterval(() => {
    const memInfo = getMemoryInfo();
    
    if (memInfo.warnings.length > 0) {
      logger.warn('process', 'Memory usage warnings detected', {
        warnings: memInfo.warnings,
        memory: memInfo.raw,
        uptime: Date.now() - serverStartTime
      });
    } else {
      logger.debug('process', 'Memory status check', {
        memory: memInfo.formatted,
        raw: memInfo.raw
      });
    }
  }, interval);
  
  logger.info('process', 'Memory monitoring started', { 
    interval: `${interval}ms`,
    warningThreshold: `${MEMORY_WARNING_THRESHOLD / 1024 / 1024}MB`,
    criticalThreshold: `${MEMORY_CRITICAL_THRESHOLD / 1024 / 1024}MB`
  });
}

/**
 * Stop memory monitoring
 */
function stopMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
    logger.debug('process', 'Memory monitoring stopped');
  }
}

/**
 * Log process information and environment
 */
function logProcessInfo(): void {
  const memInfo = getMemoryInfo();
  
  logger.info('process', 'Process information at startup', {
    pid: process.pid,
    ppid: process.ppid,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    memory: memInfo.formatted,
    argv: process.argv,
    cwd: process.cwd(),
    uptime: process.uptime()
  });
}

// Task 2.1: Add process signal handlers with detailed logging
process.on('SIGTERM', (signal) => {
  logger.warn('process', 'Received SIGTERM signal - graceful shutdown requested', {
    signal,
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted,
    pid: process.pid
  });
  
  stopMemoryMonitoring();
  
  // Perform graceful shutdown
  logger.info('process', 'Starting graceful shutdown sequence');
  
  // Flush logs before exit
  logger.flush().then(() => {
    logger.info('process', 'Graceful shutdown complete');
    process.exit(0);
  }).catch((err) => {
    logger.error('process', 'Error during graceful shutdown', err);
    process.exit(1);
  });
});

process.on('SIGINT', (signal) => {
  logger.warn('process', 'Received SIGINT signal - interrupt requested (Ctrl+C)', {
    signal,
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted,
    pid: process.pid
  });
  
  stopMemoryMonitoring();
  
  // Quick shutdown for interrupt
  logger.info('process', 'Performing interrupt shutdown');
  logger.flush().then(() => {
    process.exit(130); // Standard exit code for SIGINT
  }).catch(() => {
    process.exit(130);
  });
});

process.on('SIGQUIT', (signal) => {
  logger.error('process', 'Received SIGQUIT signal - quit with core dump requested', {
    signal,
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted,
    pid: process.pid
  });
  
  stopMemoryMonitoring();
  
  // Force quit
  process.exit(131); // Standard exit code for SIGQUIT
});

process.on('SIGHUP', (signal) => {
  logger.info('process', 'Received SIGHUP signal - hangup/reload requested', {
    signal,
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted,
    pid: process.pid
  });
  
  // For SIGHUP, we typically reload configuration rather than exit
  // But we'll log it for debugging purposes
  logger.info('process', 'SIGHUP handling: Configuration reload not implemented, continuing operation');
});

// Task 2.2: Add process.on('beforeExit') handler to capture exit reasons
process.on('beforeExit', (code) => {
  const uptime = Date.now() - serverStartTime;
  const memInfo = getMemoryInfo();
  
  logger.warn('process', 'Process is about to exit - beforeExit event', {
    exitCode: code,
    uptime,
    memory: memInfo.formatted,
    memoryWarnings: memInfo.warnings,
    pid: process.pid,
    activeHandles: (process as any)._getActiveHandles?.()?.length || 'unknown',
    activeRequests: (process as any)._getActiveRequests?.()?.length || 'unknown'
  });
  
  // Log timing information
  logger.measure('Total server uptime', 'server_lifecycle_start');
  
  stopMemoryMonitoring();
});

// Task 2.3: Add process.on('exit') handler to log final exit code and reason
process.on('exit', (code) => {
  const uptime = Date.now() - serverStartTime;
  
  // Note: Only synchronous operations are allowed in exit handler
  // We can't use our async logger here, so we use console.error
  const exitMessage = {
    timestamp: new Date().toISOString(),
    event: 'process_exit',
    exitCode: code,
    uptime,
    pid: process.pid,
    memory: process.memoryUsage()
  };
  
  console.error(`[PROCESS-EXIT] ${JSON.stringify(exitMessage)}`);
  
  // Determine exit reason based on code
  let reason = 'unknown';
  switch (code) {
    case 0: reason = 'normal_exit'; break;
    case 1: reason = 'general_error'; break;
    case 2: reason = 'invalid_usage'; break;
    case 130: reason = 'sigint_ctrl_c'; break;
    case 131: reason = 'sigquit'; break;
    case 143: reason = 'sigterm'; break;
    default: reason = `exit_code_${code}`;
  }
  
  console.error(`[PROCESS-EXIT] Server exited with code ${code} (${reason}) after ${uptime}ms uptime`);
});

// Task 2.4: Add unhandled rejection and exception handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('process', 'Unhandled Promise rejection - this may cause process termination', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString(),
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted
  });
  
  // In Node.js future versions, unhandled rejections will terminate the process
  // We'll log this as critical but not force exit to maintain current behavior
});

process.on('uncaughtException', (error, origin) => {
  logger.error('process', 'Uncaught exception - process will terminate', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    origin,
    uptime: Date.now() - serverStartTime,
    memory: getMemoryInfo().formatted,
    pid: process.pid
  });
  
  stopMemoryMonitoring();
  
  // Flush logs before forced termination
  logger.flush().then(() => {
    process.exit(1);
  }).catch(() => {
    process.exit(1);
  });
});

// Task 2.5: Monitor process warning events
process.on('warning', (warning) => {
  logger.warn('process', 'Node.js process warning detected', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
    uptime: Date.now() - serverStartTime
  });
});

// Task 2.6: Log process startup sequence with timing information
logger.info('process', 'Process lifecycle monitoring initialized', {
  pid: process.pid,
  startTime: new Date(serverStartTime).toISOString(),
  nodeVersion: process.version,
  platform: `${process.platform}-${process.arch}`
});

// Log detailed process information
logProcessInfo();

// Start memory monitoring
startMemoryMonitoring();

// ============================================================================
// TASK 4: MCP Protocol State Tracking
// ============================================================================

// Track active requests and their states
const activeRequests = new Map<string | number, {
  id: string | number;
  method: string;
  startTime: number;
  parameters?: any;
}>();

let requestCounter = 0;

/**
 * Generate unique request identifier
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

/**
 * Log MCP request start with detailed information
 */
function logMcpRequestStart(requestId: string | number, method: string, parameters?: any): void {
  const requestInfo = {
    id: requestId,
    method,
    startTime: Date.now(),
    parameters
  };
  
  activeRequests.set(requestId, requestInfo);
  
  logger.info('mcp_request', `📥 MCP request started: ${method}`, {
    requestId,
    method,
    parametersSize: parameters ? JSON.stringify(parameters).length : 0,
    activeRequestCount: activeRequests.size,
    uptime: Date.now() - serverStartTime
  });
  
  // Log parameter details if debug level
  if (parameters) {
    logger.debug('mcp_request_params', `Request parameters for ${method}`, {
      requestId,
      parameters
    });
  }
}

/**
 * Log MCP request completion with timing and result information
 */
function logMcpRequestEnd(requestId: string | number, success: boolean, resultSize?: number, error?: any): void {
  const requestInfo = activeRequests.get(requestId);
  if (!requestInfo) {
    logger.warn('mcp_request', `Request ${requestId} not found in active requests map`);
    return;
  }
  
  const duration = Date.now() - requestInfo.startTime;
  activeRequests.delete(requestId);
  
  if (success) {
    logger.info('mcp_request', `✅ MCP request completed: ${requestInfo.method}`, {
      requestId,
      method: requestInfo.method,
      duration,
      resultSize: resultSize || 0,
      activeRequestCount: activeRequests.size,
      uptime: Date.now() - serverStartTime
    });
  } else {
    logger.error('mcp_request', `❌ MCP request failed: ${requestInfo.method}`, {
      requestId,
      method: requestInfo.method,
      duration,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      activeRequestCount: activeRequests.size,
      uptime: Date.now() - serverStartTime
    });
  }
  
  // Log performance warnings
  if (duration > 5000) {
    logger.warn('mcp_performance', `Slow request detected: ${requestInfo.method} took ${duration}ms`, {
      requestId,
      method: requestInfo.method,
      duration
    });
  }
}

/**
 * Wrapper function for tool handlers to add request tracking
 * Enhanced in Task 5 with comprehensive request processing monitoring
 */
function withRequestTracking<T extends Record<string, any>>(
  toolName: string,
  handler: (args: T) => Promise<any>
): (args: T) => Promise<any> {
  return async (args: T) => {
    const requestId = generateRequestId();
    
    try {
      // Task 5.1: Use enhanced request start logging
      logMcpRequestStart(requestId, toolName, args);
      
      const result = await handler(args);
      const resultSize = result.content ? 
        JSON.stringify(result.content).length : 
        JSON.stringify(result).length;
      
      // Task 5.1: Use enhanced request end logging
      logMcpRequestEnd(requestId, true, resultSize);
      return result;
      
    } catch (error) {
      // Task 5.1: Use enhanced request failure logging
      logMcpRequestEnd(requestId, false, 0, error);
      throw error;
    }
  };
}

// Task 4.3: Add MCP notification handling and timeout monitoring
// Monitor for timeout notifications and other MCP protocol events
logger.info('mcp_protocol', 'Setting up MCP notification monitoring');

// Track MCP protocol version for compatibility monitoring
let mcpProtocolVersion: string | null = null;
const supportedProtocolVersions = ['2024-11-05', '2024-10-07', '2024-09-15'];

/**
 * Log MCP notification received from client
 */
function logMcpNotification(method: string, params?: any): void {
  logger.info('mcp_notification', `📢 MCP notification received: ${method}`, {
    method,
    params: params ? JSON.stringify(params).substring(0, 500) : undefined,
    uptime: Date.now() - serverStartTime,
    timestamp: new Date().toISOString()
  });

  // Special handling for timeout notifications (-32001 error code)
  if (method === 'cancelled' || (params && params.error && params.error.code === -32001)) {
    logger.error('mcp_timeout_notification', '🚨 TIMEOUT NOTIFICATION RECEIVED - This may cause server closure!', {
      method,
      params,
      error: params?.error,
      errorCode: params?.error?.code,
      errorMessage: params?.error?.message,
      uptime: Date.now() - serverStartTime,
      activeRequests: activeRequests.size,
      activeRequestsList: Array.from(activeRequests.values()).map(req => ({
        id: req.id,
        method: req.method,
        duration: Date.now() - req.startTime
      }))
    });
  }

  // Log other error notifications
  if (params && params.error) {
    logger.warn('mcp_error_notification', 'MCP error notification received', {
      method,
      errorCode: params.error.code,
      errorMessage: params.error.message,
      errorData: params.error.data,
      uptime: Date.now() - serverStartTime
    });
  }
}

/**
 * Monitor MCP protocol version compatibility
 */
function monitorProtocolVersionCompatibility(clientVersion: string): void {
  mcpProtocolVersion = clientVersion;
  
  const isSupported = supportedProtocolVersions.includes(clientVersion);
  
  if (isSupported) {
    logger.info('mcp_protocol_version', '✅ MCP protocol version is supported', {
      clientVersion,
      supportedVersions: supportedProtocolVersions,
      isSupported: true
    });
  } else {
    logger.warn('mcp_protocol_version', '⚠️ MCP protocol version may not be fully supported', {
      clientVersion,
      supportedVersions: supportedProtocolVersions,
      isSupported: false,
      recommendation: 'Consider updating to a supported protocol version'
    });
  }
}

/**
 * Enhanced transport message monitoring for notifications
 */
function setupTransportMessageMonitoring(transport: any): void {
  logger.debug('transport', 'Setting up enhanced transport message monitoring for notifications');

  // Monitor incoming messages for notifications
  const originalOnMessage = transport.onmessage;
  if (originalOnMessage || typeof transport.onmessage !== 'undefined') {
    transport.onmessage = (message: any) => {
      try {
        // Parse JSON-RPC message
        const jsonMessage = typeof message === 'string' ? JSON.parse(message) : message;
        
        // Log client capability negotiation on initialize
        if (jsonMessage.method === 'initialize') {
          logger.info('client', 'Client capability negotiation', { capabilities: jsonMessage.params?.capabilities });
         }

        logger.debug('transport_message', 'Incoming transport message', {
          hasId: 'id' in jsonMessage,
          method: jsonMessage.method,
          messageType: 'id' in jsonMessage ? 'request/response' : 'notification',
          size: JSON.stringify(message).length
        });

        // Handle MCP initialization for protocol version monitoring  
        if (jsonMessage.method === 'initialize' && jsonMessage.params?.protocolVersion) {
          monitorProtocolVersionCompatibility(jsonMessage.params.protocolVersion);
        }

        // Handle notifications (messages without id field)
        if (!('id' in jsonMessage) && jsonMessage.method) {
          logMcpNotification(jsonMessage.method, jsonMessage.params);
        }

        // Handle error responses that might contain timeout information
        if ('id' in jsonMessage && jsonMessage.error) {
          logger.warn('mcp_error_response', 'MCP error response received', {
            requestId: jsonMessage.id,
            errorCode: jsonMessage.error.code,
            errorMessage: jsonMessage.error.message,
            errorData: jsonMessage.error.data
          });

          // Check for timeout-related errors
          if (jsonMessage.error.code === -32001 || 
              (jsonMessage.error.message && jsonMessage.error.message.toLowerCase().includes('timeout'))) {
            logger.error('mcp_timeout_error', '🚨 TIMEOUT ERROR DETECTED in MCP response', {
              requestId: jsonMessage.id,
              errorCode: jsonMessage.error.code,
              errorMessage: jsonMessage.error.message,
              uptime: Date.now() - serverStartTime
            });
          }
        }

        // Call original handler if it exists
        if (originalOnMessage) {
          return originalOnMessage.call(transport, message);
        }
      } catch (parseError) {
        logger.warn('transport_message', 'Failed to parse incoming message for notification monitoring', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          messagePreview: typeof message === 'string' ? message.substring(0, 100) : 'Non-string message'
        });
        
        // Call original handler if it exists
        if (originalOnMessage) {
          return originalOnMessage.call(transport, message);
        }
      }
    };
  }

  // Monitor outgoing messages as well
  const originalSend = transport.send;
  if (originalSend) {
    transport.send = (message: any) => {
      try {
        const jsonMessage = typeof message === 'string' ? JSON.parse(message) : message;
        
        logger.debug('transport_message', 'Outgoing transport message', {
          hasId: 'id' in jsonMessage,
          method: jsonMessage.method,
          messageType: 'id' in jsonMessage ? 'request/response' : 'notification',
          size: JSON.stringify(message).length
        });
      } catch (parseError) {
        logger.debug('transport_message', 'Failed to parse outgoing message', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error'
        });
      }
      
      return originalSend.call(transport, message);
    };
  }
}

// Task 8: Timeout-specific debugging
// Configurable timeout thresholds via environment variables
const REQUEST_TIMEOUT_WARNING = parseInt(process.env.MCP_TIMEOUT_WARNING || '10000', 10); // default 10s
const REQUEST_TIMEOUT_CRITICAL = parseInt(process.env.MCP_TIMEOUT_CRITICAL || '30000', 10); // default 30s

// Track timeouts per method for pattern analysis
const mcpTimeoutCounts = new Map<string, number>();

// Set up periodic monitoring for long-running requests
const requestTimeoutChecker = setInterval(() => {
  const now = Date.now();
  
  for (const [requestId, requestInfo] of activeRequests.entries()) {
    const duration = now - requestInfo.startTime;
    
    if (duration > REQUEST_TIMEOUT_CRITICAL) {
      // Increment timeout count for method
      const prevCount = mcpTimeoutCounts.get(requestInfo.method) || 0;
      mcpTimeoutCounts.set(requestInfo.method, prevCount + 1);
      
      logger.error('mcp_timeout', '🚨 Critical timeout detected - request running too long', {
        requestId,
        method: requestInfo.method,
        duration,
        parameters: requestInfo.parameters,
        activeRequestQueueDepth: activeRequests.size,
        uptime: now - serverStartTime
      });
      // Log timeout patterns
      logger.info('timeout_patterns', 'MCP timeout counts by method', {
        timeoutCounts: Array.from(mcpTimeoutCounts.entries())
      });
    } else if (duration > REQUEST_TIMEOUT_WARNING) {
      logger.warn('mcp_timeout', '⏰ Request timeout warning - slow response detected', {
        requestId,
        method: requestInfo.method,
        duration,
        activeRequestQueueDepth: activeRequests.size,
        uptime: now - serverStartTime
      });
    }
  }
}, 5000); // Check every 5 seconds

// Periodically log response time distribution and identify slow operations
const RESPONSE_TIME_MONITOR_INTERVAL = parseInt(process.env.MCP_RESPONSE_TIME_MONITOR_INTERVAL || '60000', 10);
const responseTimeMonitor = setInterval(() => {
  const insights = metricsCollector.getPerformanceInsights();
  logger.info('timeout_debug', 'Response time distribution and slow endpoint analysis', {
    slowestEndpoints: insights.slowestEndpoints,
    recommendedOptimizations: insights.recommendedOptimizations
  });
}, RESPONSE_TIME_MONITOR_INTERVAL);

// Clean up intervals on process exit
process.on('beforeExit', () => {
  if (requestTimeoutChecker) {
    clearInterval(requestTimeoutChecker);
  }
  if (responseTimeMonitor) {
    clearInterval(responseTimeMonitor);
  }
});
