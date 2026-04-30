import { Command } from "commander";
import * as prCore from "../../core/pull-requests.js";
import * as prCommentsCore from "../../core/pr-comments.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { CliError } from "../errors.js";

export interface PrCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildPrCommand(globalOpts: PrCommandOptions): Command {
  const cmd = new Command("pr").description("Pull request operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List pull requests in a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--state <state>", "OPEN | MERGED | DECLINED | SUPERSEDED")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(async (opts) => {
      const result = await prCore.listPullRequests(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        state: opts.state, page: opts.page, pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
        result.items.map((p) =>
          `#${p.id}\t${p.state}\t${p.title}\t${p.links.html.href}`,
        ).join("\n") || "(no pull requests)",
      );
    });

  cmd.command("view <id>")
    .description("Show details for a single pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(async (id: string, opts) => {
      const pr_id = parseIntStrict(id, "pr id");
      const pr = await prCore.getPullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo, pr_id,
      });
      emit(ctx(), pr, () =>
        [`#${pr.id} ${pr.title}`, `state: ${pr.state}`, `url: ${pr.links.html.href}`,
          pr.description ? `\n${pr.description}` : ""].join("\n"),
      );
    });

  cmd.command("create")
    .description("Create a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .requiredOption("-t, --title <title>", "PR title")
    .requiredOption("-s, --source <branch>", "Source branch")
    .option("-d, --destination <branch>", "Destination branch (defaults to repo main)")
    .option("--description <text>", "PR description (Markdown)")
    .option("--close-source-branch", "Close source branch on merge", false)
    .option("--reviewer <uuid...>", "Reviewer account UUIDs")
    .action(async (opts) => {
      const pr = await prCore.createPullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        title: opts.title, source_branch: opts.source,
        destination_branch: opts.destination, description: opts.description,
        close_source_branch: opts.closeSourceBranch, reviewers: opts.reviewer,
      });
      emit(ctx(), pr, () => `created PR #${pr.id}: ${pr.links.html.href}`);
    });

  cmd.command("edit <id>")
    .description("Update PR title and/or description")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("-t, --title <title>", "New title")
    .option("--description <text>", "New description")
    .action(async (id: string, opts) => {
      if (opts.title === undefined && opts.description === undefined) {
        throw new CliError("Provide --title and/or --description");
      }
      const pr = await prCore.updatePullRequest(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
        title: opts.title, description: opts.description,
      });
      emit(ctx(), pr, () => `updated PR #${pr.id}: ${pr.links.html.href}`);
    });

  cmd.command("diff <id>")
    .description("Print the unified diff for a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(async (id: string, opts) => {
      const result = await prCore.getPullRequestDiff(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
      });
      emit(ctx(), result, () => result.diff);
    });

  const comment = cmd.command("comment").description("Pull request comment operations");

  comment.command("list <id>")
    .description("List comments on a pull request")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(async (id: string, opts) => {
      const result = await prCommentsCore.listPrComments(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pull_request_id: parseIntStrict(id, "pr id"),
        page: opts.page, pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
        result.items.map((c) =>
          `#${c.id}\t@${c.user.username}\t${c.content.raw.split("\n")[0].slice(0, 80)}`,
        ).join("\n") || "(no comments)",
      );
    });

  comment.command("create <id>")
    .description("Create a comment on a pull request (optionally inline or as a reply)")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .requiredOption("-m, --message <text>", "Comment text")
    .option("--parent <commentId>", "Reply to comment id", parseIntOpt)
    .option("--file <path>", "Inline comment: file path")
    .option("--from <line>", "Inline comment: old-version line number", parseIntOpt)
    .option("--to <line>", "Inline comment: new-version line number", parseIntOpt)
    .action(async (id: string, opts) => {
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
    });

  // Propagate exitOverride to subcommands so tests can use cmd.exitOverride()
  // and have it apply to all nested commands (commander only copies _exitCallback
  // at subcommand creation time, not when exitOverride is called later).
  const originalExitOverride = cmd.exitOverride.bind(cmd);
  cmd.exitOverride = function (fn?: (err: any) => never) {
    originalExitOverride(fn as any);
    const applyToAll = (parent: Command) => {
      for (const sub of parent.commands) {
        if (fn) {
          sub.exitOverride(fn);
        } else {
          sub.exitOverride();
        }
        applyToAll(sub);
      }
    };
    applyToAll(cmd);
    return cmd;
  };

  return cmd;
}

function parseIntOpt(v: string): number {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new CliError(`expected integer, got: ${v}`);
  return n;
}
function parseIntStrict(v: string, label: string): number {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new CliError(`${label} must be an integer, got: ${v}`);
  return n;
}
