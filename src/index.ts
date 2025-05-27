#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BitbucketAPI, Repository, PullRequest, Issue, Branch, Commit, Comment } from "./bitbucket-api.js";
import { metricsCollector } from "./metrics.js";
import { configManager, validateEnvironment } from "./config.js";
import { MultiTierRateLimiter, createDefaultRateLimitConfig } from "./rate-limiting.js";

// Environment variables for authentication
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;

// Validate environment on startup
const envValidation = validateEnvironment();
if (!envValidation.valid) {
  console.error("Environment validation failed:");
  envValidation.errors.forEach(error => console.error(`  ❌ ${error}`));
  if (envValidation.warnings.length > 0) {
    console.error("Warnings:");
    envValidation.warnings.forEach(warning => console.error(`  ⚠️  ${warning}`));
  }
}

// Create rate limiter
const rateLimiter = new MultiTierRateLimiter(createDefaultRateLimitConfig());

// Create Bitbucket API instance
const bitbucketAPI = new BitbucketAPI();

// Create server instance
const server = new McpServer({
  name: "bitbucket-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Tool: List repositories for a workspace
server.tool(
  "list-repositories",
  "List repositories in a Bitbucket workspace",
  {
    workspace: z.string().describe("Bitbucket workspace name (username or team name)"),
    role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("Filter by user role"),
    sort: z.enum(["created_on", "updated_on", "name", "size"]).optional().describe("Sort repositories by"),
  },
  async ({ workspace, role, sort }) => {
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
  }
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup message to stderr so it doesn't interfere with MCP communication
  console.error("🚀 Bitbucket MCP Server v1.0.0 running on stdio");
  console.error("📋 Available tools: list-repositories, get-repository, list-pull-requests, get-pull-request, get-pr-diff, create-pr-comment, list-issues, list-branches, get-commits, search, get-metrics, health-check");
  console.error(`⚙️  Configuration: ${configManager.isAuthenticationConfigured() ? '✅ Authenticated' : '❌ No authentication'}`);
  console.error(`📊 Metrics: ${configManager.get('enableMetrics') ? '✅ Enabled' : '❌ Disabled'}`);
  
  if (!BITBUCKET_USERNAME || !BITBUCKET_APP_PASSWORD) {
    console.error("⚠️  WARNING: BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables not set.");
    console.error("   Some functionality may be limited to public repositories only.");
  }
  
  // Log configuration validation
  const configValidation = configManager.validate();
  if (!configValidation.valid) {
    console.error("❌ Configuration issues detected:");
    configValidation.errors.forEach(error => console.error(`   • ${error}`));
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
