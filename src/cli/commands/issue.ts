import { Command } from "commander";
import * as issuesCore from "../../core/issues.js";
import type { Issue } from "../../bitbucket-api.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emitPaginated, OutputContext } from "../format.js";
import { action } from "../action.js";
import { parsePagelenOpt, propagateExitOverride } from "../utils.js";

export interface IssueCommandOptions {
  json: boolean;
  pretty: boolean;
  workspace?: string;
}

export function buildIssueCommand(globalOpts: IssueCommandOptions): Command {
  const cmd = new Command("issue").description("Issue operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json, pretty: globalOpts.pretty });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List issues for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--state <state>", "Filter by issue state (new|open|resolved|on hold|invalid|duplicate|wontfix|closed)")
    .option("--kind <kind>", "Filter by issue kind (bug|enhancement|proposal|task)")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (opts) => {
      const kind: string | undefined = opts.kind;
      const result = await issuesCore.listIssues(createApiClient(), {
        workspace: ws(),
        repo_slug: opts.repo,
        state: opts.state,
        page: opts.page,
        pagelen: opts.pagelen,
      });
      const issues = result.items;
      const filteredIssues = kind ? issues.filter((i: Issue) => i.kind === kind) : issues;
      // The spread { ...result, items: filteredIssues } is intentional: it
      // forwards `result.next` so emitPaginated can attach the next-page hint.
      emitPaginated(ctx(), { ...result, items: filteredIssues }, () =>
        filteredIssues.map((i: Issue) =>
          `#${i.id}\t${i.state}\t${i.kind}\t${i.title}\t${i.links.html.href}`,
        ).join("\n") || "(no issues)",
      );
    }));

  propagateExitOverride(cmd);
  return cmd;
}

