import { Command } from "commander";
import * as branchesCore from "../../core/branches.js";
import type { Branch } from "../../bitbucket-api.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { action } from "../action.js";
import { parsePagelenOpt, propagateExitOverride } from "../utils.js";

export interface BranchCommandOptions {
  json: boolean;
  pretty: boolean;
  workspace?: string;
}

export function buildBranchCommand(globalOpts: BranchCommandOptions): Command {
  const cmd = new Command("branch").description("Branch operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json, pretty: globalOpts.pretty });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List branches for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (opts) => {
      const result = await branchesCore.listBranches(createApiClient(), {
        workspace: ws(),
        repo_slug: opts.repo,
        page: opts.page,
        pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
        result.items.map((b: Branch) =>
          `${b.name}\t${b.target.hash.substring(0, 8)}\t${b.links.html.href}`,
        ).join("\n") || "(no branches)",
      );
    }));

  propagateExitOverride(cmd);
  return cmd;
}

