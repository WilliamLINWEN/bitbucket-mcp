import { Command } from "commander";
import * as commitsCore from "../../core/commits.js";
import type { Commit } from "../../bitbucket-api.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { action } from "../action.js";
import { parsePagelenOpt } from "../utils.js";

export interface CommitCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildCommitCommand(globalOpts: CommitCommandOptions): Command {
  const cmd = new Command("commit").description("Commit operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List recent commits for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--branch <name>", "Branch name (defaults to main branch)")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (opts) => {
      const result = await commitsCore.listCommits(createApiClient(), {
        workspace: ws(),
        repo_slug: opts.repo,
        branch: opts.branch,
        page: opts.page,
        pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
        result.items.map((c: Commit) =>
          `${c.hash.substring(0, 8)}\t${c.message.split("\n")[0].slice(0, 72)}\t${c.links.html.href}`,
        ).join("\n") || "(no commits)",
      );
    }));

  cmd.command("view <hash>")
    .description("Show details for a single commit")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (hash: string, opts) => {
      const commit = await commitsCore.getCommit(createApiClient(), {
        workspace: ws(),
        repo_slug: opts.repo,
        commit_hash: hash,
      });
      const author = commit.author.user
        ? `${commit.author.user.display_name} (@${commit.author.user.username})`
        : commit.author.raw;
      emit(ctx(), commit, () => [
        `${commit.hash.substring(0, 8)} ${commit.message.split("\n")[0]}`,
        `author: ${author}`,
        `date: ${new Date(commit.date).toISOString()}`,
        `url: ${commit.links.html.href}`,
      ].join("\n"));
    }));

  // Propagate exitOverride to subcommands
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

