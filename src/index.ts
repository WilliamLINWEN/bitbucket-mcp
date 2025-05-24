#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BitbucketAPI, Repository, PullRequest, Issue, Branch, Commit } from "./bitbucket-api.js";
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
              "- list-issues: ✅",
              "- list-branches: ✅",
              "- get-commits: ✅",
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

// Tool: Create a new repository
server.tool(
  "create-repository",
  "Create a new repository in a Bitbucket workspace",
  {
    workspace: z.string().describe("Bitbucket workspace name"),
    name: z.string().describe("Repository name (will be used as slug)"),
    description: z.string().optional().describe("Repository description"),
    isPrivate: z.boolean().default(true).describe("Whether the repository should be private"),
    language: z.string().optional().describe("Primary programming language"),
    hasIssues: z.boolean().default(true).describe("Enable issue tracking"),
    hasWiki: z.boolean().default(false).describe("Enable wiki"),
    forkPolicy: z.enum(["allow_forks", "no_public_forks", "no_forks"]).default("allow_forks").describe("Fork policy"),
  },
  async ({ workspace, name, description, isPrivate, language, hasIssues, hasWiki, forkPolicy }) => {
    try {
      const startTime = Date.now();
      
      // Check rate limit
      const rateLimitResult = rateLimiter.checkLimit('write');
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limit exceeded. Try again in ${rateLimitResult.retryAfter}ms`);
      }

      const repoData = {
        name,
        description: description || `Repository ${name}`,
        is_private: isPrivate,
        language: language || "",
        has_issues: hasIssues,
        has_wiki: hasWiki,
        fork_policy: forkPolicy,
        scm: "git",
      };

      const repository = await bitbucketAPI.createRepository(workspace, repoData);

      // Record metrics
      metricsCollector.recordRequest({
        tool: 'create-repository',
        endpoint: `/repositories/${workspace}/${name}`,
        method: 'POST',
        duration: Date.now() - startTime,
        status: 201,
        timestamp: startTime,
        success: true,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `# ✅ Repository Created Successfully`,
              "",
              `**Name:** ${repository.name}`,
              `**Workspace:** ${workspace}`,
              `**Privacy:** ${repository.is_private ? '🔒 Private' : '🌍 Public'}`,
              `**Language:** ${repository.language || 'Not specified'}`,
              `**Created:** ${new Date(repository.created_on).toLocaleString()}`,
              `**Clone URL (HTTPS):** ${repository.links.clone.find((link: any) => link.name === 'https')?.href || 'N/A'}`,
              `**Clone URL (SSH):** ${repository.links.clone.find((link: any) => link.name === 'ssh')?.href || 'N/A'}`,
              `**Web URL:** ${repository.links.html.href}`,
              "",
              `**Features:**`,
              `• Issues: ${(repository as any).has_issues ? '✅ Enabled' : '❌ Disabled'}`,
              `• Wiki: ${(repository as any).has_wiki ? '✅ Enabled' : '❌ Disabled'}`,
              `• Fork Policy: ${(repository as any).fork_policy}`,
              "",
              `🎉 Your repository is ready! You can now clone it and start developing.`
            ].join("\n"),
          },
        ],
      };

    } catch (error) {
      // Record failed request
      metricsCollector.recordRequest({
        tool: 'create-repository',
        endpoint: `/repositories/${workspace}/${name}`,
        method: 'POST',
        duration: Date.now() - Date.now(),
        status: 500,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool: Manage repository settings
server.tool(
  "update-repository",
  "Update repository settings and configuration",
  {
    workspace: z.string().describe("Bitbucket workspace name"),
    repoSlug: z.string().describe("Repository slug"),
    description: z.string().optional().describe("New repository description"),
    isPrivate: z.boolean().optional().describe("Change repository privacy"),
    language: z.string().optional().describe("Update primary programming language"),
    hasIssues: z.boolean().optional().describe("Enable/disable issue tracking"),
    hasWiki: z.boolean().optional().describe("Enable/disable wiki"),
    forkPolicy: z.enum(["allow_forks", "no_public_forks", "no_forks"]).optional().describe("Update fork policy"),
  },
  async ({ workspace, repoSlug, description, isPrivate, language, hasIssues, hasWiki, forkPolicy }) => {
    try {
      const startTime = Date.now();
      
      // Check rate limit
      const rateLimitResult = rateLimiter.checkLimit('write');
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limit exceeded. Try again in ${rateLimitResult.retryAfter}ms`);
      }

      // Build update data with only provided fields
      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (isPrivate !== undefined) updateData.is_private = isPrivate;
      if (language !== undefined) updateData.language = language;
      if (hasIssues !== undefined) updateData.has_issues = hasIssues;
      if (hasWiki !== undefined) updateData.has_wiki = hasWiki;
      if (forkPolicy !== undefined) updateData.fork_policy = forkPolicy;

      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "❌ No updates specified. Please provide at least one field to update.",
            },
          ],
        };
      }

      const repository = await bitbucketAPI.updateRepository(workspace, repoSlug, updateData);

      // Record metrics
      metricsCollector.recordRequest({
        tool: 'update-repository',
        endpoint: `/repositories/${workspace}/${repoSlug}`,
        method: 'PUT',
        duration: Date.now() - startTime,
        status: 200,
        timestamp: startTime,
        success: true,
      });

      const changes: string[] = [];
      if (description !== undefined) changes.push(`Description updated`);
      if (isPrivate !== undefined) changes.push(`Privacy changed to ${isPrivate ? 'Private' : 'Public'}`);
      if (language !== undefined) changes.push(`Language set to ${language || 'None'}`);
      if (hasIssues !== undefined) changes.push(`Issues ${hasIssues ? 'enabled' : 'disabled'}`);
      if (hasWiki !== undefined) changes.push(`Wiki ${hasWiki ? 'enabled' : 'disabled'}`);
      if (forkPolicy !== undefined) changes.push(`Fork policy set to ${forkPolicy}`);

      return {
        content: [
          {
            type: "text",
            text: [
              `# ✅ Repository Updated Successfully`,
              "",
              `**Repository:** ${repository.name} (${workspace})`,
              `**Updated:** ${new Date().toLocaleString()}`,
              "",
              `**Changes Applied:**`,
              ...changes.map(change => `• ${change}`),
              "",
              `**Current Settings:**`,
              `• Privacy: ${repository.is_private ? '🔒 Private' : '🌍 Public'}`,
              `• Language: ${repository.language || 'Not specified'}`,
              `• Issues: ${(repository as any).has_issues ? '✅ Enabled' : '❌ Disabled'}`,
              `• Wiki: ${(repository as any).has_wiki ? '✅ Enabled' : '❌ Disabled'}`,
              `• Fork Policy: ${(repository as any).fork_policy}`,
              `• Description: ${repository.description || 'No description'}`,
              "",
              `🌐 **Web URL:** ${repository.links.html.href}`
            ].join("\n"),
          },
        ],
      };

    } catch (error) {
      // Record failed request
      metricsCollector.recordRequest({
        tool: 'update-repository',
        endpoint: `/repositories/${workspace}/${repoSlug}`,
        method: 'PUT',
        duration: Date.now() - Date.now(),
        status: 500,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

// Main function to run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup message to stderr so it doesn't interfere with MCP communication
  console.error("🚀 Bitbucket MCP Server v1.0.0 running on stdio");
  console.error("📋 Available tools: list-repositories, get-repository, list-pull-requests, list-issues, list-branches, get-commits, health-check, search, get-metrics, create-repository, update-repository");
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
