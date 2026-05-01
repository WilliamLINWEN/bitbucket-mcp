import { Command } from "commander";
import * as issuesCore from "../../core/issues.js";
import type { Issue } from "../../bitbucket-api.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import { action } from "../action.js";

export interface IssueCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildIssueCommand(globalOpts: IssueCommandOptions): Command {
  const cmd = new Command("issue").description("Issue operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List issues for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--state <state>", "Filter by issue state (new|open|resolved|on hold|invalid|duplicate|wontfix|closed)")
    .option("--kind <kind>", "Filter by issue kind (bug|enhancement|proposal|task)")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(action(async (opts) => {
      const result = await issuesCore.listIssues(createApiClient(), {
        workspace: ws(),
        repo_slug: opts.repo,
        state: opts.state,
        kind: opts.kind,
        page: opts.page,
        pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
        result.items.map((i: Issue) =>
          `#${i.id}\t${i.state}\t${i.kind}\t${i.title}\t${i.links.html.href}`,
        ).join("\n") || "(no issues)",
      );
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

// TODO: replace with shared utils.ts versions
function parseIntOpt(v: string): number {
  if (!/^-?\d+$/.test(v)) throw new CliError(`expected integer, got: ${v}`);
  return Number.parseInt(v, 10);
}
