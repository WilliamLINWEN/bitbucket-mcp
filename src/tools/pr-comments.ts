import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import { makeRegister } from "./helpers.js";
import * as prCommentsCore from "../core/pr-comments.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Merged: pr-comments
  registerTool(
    "pr-comments",
    "List comments on a pull request, or get details for a single comment when `comment_id` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pr_id: z.number().describe("Pull request ID"),
      comment_id: z.number().optional().describe("Comment ID. If provided, returns a single comment; otherwise lists."),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("pr-comments", async ({ workspace: ws, repo_slug, pr_id, comment_id, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (comment_id !== undefined) {
        return getPrComment(bitbucketAPI, workspace, repo_slug, pr_id, comment_id);
      }
      return listPrComments(bitbucketAPI, workspace, repo_slug, pr_id, { page, pagelen });
    }),
  );

  registerCreatePrComment(registerTool, bitbucketAPI);
}

async function listPrComments(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pull_request_id: number,
  opts: { page?: string; pagelen?: number },
) {
  try {
    const result = await prCommentsCore.listPrComments(api, { workspace, repo_slug, pull_request_id, page: opts.page, pagelen: opts.pagelen });
    const comments = result.items;

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

async function getPrComment(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pull_request_id: number,
  comment_id: number,
) {
  try {
    const comment = await prCommentsCore.getPrComment(api, { workspace, repo_slug, pull_request_id, comment_id });

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

function registerCreatePrComment(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  registerTool(
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
        // Set up inline options if file_path is provided
        const inlineOptions = file_path ? {
          path: file_path,
          from: from_line,
          to: to_line
        } : undefined;

        const comment = await prCommentsCore.createPrComment(api, {
          workspace,
          repo_slug,
          pull_request_id,
          content,
          inline: inlineOptions,
          parent_id,
        });

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
    },
  );
}
