import { Command } from "commander";
import * as prCore from "../../core/pull-requests.js";
import * as prCommentsCore from "../../core/pr-comments.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, emitPaginated, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import { action } from "../action.js";
import { parseIntOpt, parseIntStrict, parsePagelenOpt, propagateExitOverride } from "../utils.js";

export interface PrCommandOptions {
  json: boolean;
  pretty: boolean;
  workspace?: string;
}

export function buildPrCommand(globalOpts: PrCommandOptions): Command {
  const cmd = new Command("pr").description("Pull request operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json, pretty: globalOpts.pretty });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List pull requests in a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--state <state>", "OPEN | MERGED | DECLINED | SUPERSEDED")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (opts) => {
      if (opts.state !== undefined) {
        const validStates = ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"];
        if (!validStates.includes(opts.state)) {
          throw new CliError(`--state must be one of ${validStates.join(", ")}; got: ${opts.state}`);
        }
      }
      const result = await prCore.listPullRequests(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        state: opts.state, page: opts.page, pagelen: opts.pagelen,
      });
      emitPaginated(ctx(), result, () =>
        result.items.map((p) =>
          `#${p.id}\t${p.state}\t${p.title}\t${p.links.html.href}`,
        ).join("\n") || "(no pull requests)",
      );
    }));

  cmd.command("view <id>")
    .description("Show details for a single pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (id: string, opts) => {
      const pr_id = parseIntStrict(id, "pr id");
      const pr = await prCore.getPullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo, pr_id,
      });
      emit(ctx(), pr, () =>
        [`#${pr.id} ${pr.title}`, `state: ${pr.state}`, `url: ${pr.links.html.href}`,
          pr.description ? `\n${pr.description}` : ""].join("\n"),
      );
    }));

  cmd.command("create")
    .description("Create a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .requiredOption("-t, --title <title>", "PR title")
    .requiredOption("-s, --source <branch>", "Source branch")
    .option("-d, --destination <branch>", "Destination branch (defaults to repo main)")
    .option("--description <text>", "PR description (Markdown)")
    .option("--close-source-branch", "Close source branch on merge", false)
    .option("--reviewer <uuid...>", "Reviewer account UUIDs")
    .action(action(async (opts) => {
      const pr = await prCore.createPullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        title: opts.title, source_branch: opts.source,
        destination_branch: opts.destination, description: opts.description,
        close_source_branch: opts.closeSourceBranch, reviewers: opts.reviewer,
      });
      emit(ctx(), pr, () => `created PR #${pr.id}: ${pr.links.html.href}`);
    }));

  cmd.command("edit <id>")
    .description("Update PR title and/or description")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("-t, --title <title>", "New title")
    .option("--description <text>", "New description")
    .action(action(async (id: string, opts) => {
      if (opts.title === undefined && opts.description === undefined) {
        throw new CliError("Provide --title and/or --description");
      }
      const pr = await prCore.updatePullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
        title: opts.title, description: opts.description,
      });
      emit(ctx(), pr, () => `updated PR #${pr.id}: ${pr.links.html.href}`);
    }));

  cmd.command("diff <id>")
    .description("Print the unified diff for a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (id: string, opts) => {
      const result = await prCore.getPullRequestDiff(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
      });
      emit(ctx(), result, () => result.diff);
    }));

  const comment = cmd.command("comment").description("Pull request comment operations");

  comment.command("list <id>")
    .description("List comments on a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (id: string, opts) => {
      const result = await prCommentsCore.listPrComments(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
        page: opts.page, pagelen: opts.pagelen,
      });
      emitPaginated(ctx(), result, () =>
        result.items.map((c) =>
          `#${c.id}\t@${c.user.username}\t${c.content.raw.split("\n")[0].slice(0, 80)}`,
        ).join("\n") || "(no comments)",
      );
    }));

  comment.command("create <id>")
    .description("Create a comment on a pull request (optionally inline or as a reply)")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .requiredOption("-m, --message <text>", "Comment text")
    .option("--parent <commentId>", "Reply to comment id", parseIntOpt)
    .option("--file <path>", "Inline comment: file path")
    .option("--from <line>", "Inline comment: old-version line number", parseIntOpt)
    .option("--to <line>", "Inline comment: new-version line number", parseIntOpt)
    .action(action(async (id: string, opts) => {
      const inline = opts.file
        ? { path: opts.file as string, from: opts.from, to: opts.to }
        : undefined;
      const c = await prCommentsCore.createPrComment(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
        content: opts.message,
        parent_id: opts.parent,
        inline,
      });
      emit(ctx(), c, () => `created comment #${c.id}: ${c.links.html.href}`);
    }));

  propagateExitOverride(cmd);
  return cmd;
}

