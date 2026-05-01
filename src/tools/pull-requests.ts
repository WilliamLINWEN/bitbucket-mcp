import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";
import * as pullRequestsCore from "../core/pull-requests.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Merged: pull-requests
  registerTool(
    "pull-requests",
    "List pull requests for a repository, or get details for a single pull request when `pr_id` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pr_id: z.number().optional().describe("Pull request ID. If provided, returns a single PR; otherwise lists."),
      state: z.union([
        z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]),
        z.array(z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])),
      ]).optional().describe("(list only) Filter by state. Accepts a single state or an array of states: OPEN, MERGED, DECLINED, SUPERSEDED"),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("pull-requests", async ({ workspace: ws, repo_slug, pr_id, state, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (pr_id !== undefined) {
        return getPullRequest(bitbucketAPI, workspace, repo_slug, pr_id);
      }
      return listPullRequests(bitbucketAPI, workspace, repo_slug, { state, page, pagelen });
    }),
  );

  // Relocated unchanged tools
  registerCreatePullRequest(registerTool, bitbucketAPI);
  registerUpdatePrDescription(registerTool, bitbucketAPI);
  registerGetPrDiff(registerTool, bitbucketAPI);
}

async function listPullRequests(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  opts: { state?: any; page?: string; pagelen?: number },
) {
  try {
    const result = await pullRequestsCore.listPullRequests(api, {
      workspace, repo_slug, state: opts.state, page: opts.page, pagelen: opts.pagelen,
    });
    const pullRequests = result.items;

    const stateList = opts.state ? (Array.isArray(opts.state) ? opts.state : [opts.state]) : [];
    const stateText = stateList.length > 0 ? ` with state [${stateList.join(", ")}]` : "";

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
      result.next !== undefined ? `Next page: ${result.next}` : null,
    ].filter(Boolean).join("\n");

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
          text: `Failed to retrieve pull requests for '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
}

async function getPullRequest(api: BitbucketAPI, workspace: string, repo_slug: string, pr_id: number) {
  try {
    const pr = await pullRequestsCore.getPullRequest(api, { workspace, repo_slug, pr_id });

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
          text: `Failed to retrieve pull request #${pr_id} from '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
}

function registerCreatePullRequest(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  registerTool(
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
        const pr = await pullRequestsCore.createPullRequest(api, {
          workspace, repo_slug,
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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
    },
  );
}

function registerUpdatePrDescription(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  registerTool(
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
        if (title === undefined && description === undefined) {
          return {
            content: [
              {
                type: "text",
                text: "❌ You must provide at least one of 'title' or 'description' to update.",
              },
            ],
          };
        }
        if (title === "") {
          return {
            content: [
              {
                type: "text",
                text: "❌ 'title' cannot be empty. Provide a non-empty title or omit the field.",
              },
            ],
          };
        }

        const pr = await pullRequestsCore.updatePullRequest(api, {
          workspace, repo_slug, pull_request_id, title, description,
        });

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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
    },
  );
}

function registerGetPrDiff(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  registerTool(
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
        const { diff } = await pullRequestsCore.getPullRequestDiff(api, {
          workspace, repo_slug, pull_request_id,
        });

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
              text: `Failed to retrieve diff for pull request #${pull_request_id} in '${workspace}/${repo_slug}': ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  );
}
