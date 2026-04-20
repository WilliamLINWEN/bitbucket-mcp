import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  registerTool(
    "commits",
    "List recent commits for a repository, or get details for a single commit when `commit_hash` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      commit_hash: z.string().optional().describe("Commit hash. If provided, returns single commit details; otherwise lists recent commits."),
      branch: z.string().optional().describe("(list only) Branch name (defaults to main branch)"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("commits", async ({ workspace: ws, repo_slug, commit_hash, branch, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (commit_hash) {
        return getCommit(bitbucketAPI, workspace, repo_slug, commit_hash);
      }
      return listCommits(bitbucketAPI, workspace, repo_slug, { branch, page, pagelen });
    }),
  );
}

async function listCommits(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  opts: { branch?: string; page?: string; pagelen?: number },
) {
  try {
    const result = await api.getCommits(workspace, repo_slug, opts.branch, opts.page, opts.pagelen);
    const commits = result.commits;

    if (commits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No commits found in '${workspace}/${repo_slug}'${opts.branch ? ` on branch '${opts.branch}'` : ''}.`,
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
          text: `Found ${commits.length} recent commits in '${workspace}/${repo_slug}'${opts.branch ? ` on branch '${opts.branch}'` : ''}:\n\n${commitText.join("\n")}${paginationText ? `\n${paginationText}` : ""}`,
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

async function getCommit(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  commit_hash: string,
) {
  try {
    const commit = await api.getCommit(workspace, repo_slug, commit_hash);
    const parentHashes = commit.parents.map((p: { hash: string }) => p.hash.substring(0, 8)).join(", ") || "None";
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
}
