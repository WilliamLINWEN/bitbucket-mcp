import { Command } from "commander";
import { BitbucketAPI } from "../../bitbucket-api.js";
import * as repositoriesCore from "../../core/repositories.js";
import { resolveWorkspace } from "../../validation.js";
import { emit, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import type {
  ListRepositoriesResult,
  GetRepositoryResult,
} from "../../core/types.js";

export interface RepoCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildRepoCommand(globalOpts: RepoCommandOptions): Command {
  const cmd = new Command("repo").description("Repository operations");

  cmd
    .command("list")
    .description("List repositories in a workspace")
    .option("--role <role>", "Filter by user role (owner|admin|contributor|member)")
    .option("--sort <field>", "Sort by created_on|updated_on|name|size")
    .option("--page <page>", "Page number or opaque next page URL")
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(async (opts) => {
      const workspace = resolveWorkspace(globalOpts.workspace);
      const api = new BitbucketAPI(
        process.env.BITBUCKET_USERNAME,
        process.env.BITBUCKET_APP_PASSWORD,
        process.env.BITBUCKET_API_TOKEN,
      );
      const result = await repositoriesCore.listRepositories(api, {
        workspace,
        role: opts.role,
        sort: opts.sort,
        page: opts.page,
        pagelen: opts.pagelen,
      });
      emit(toCtx(globalOpts), result, () => formatList(workspace, result));
    });

  cmd
    .command("view <slug>")
    .description("Show details for a single repository")
    .action(async (slug: string) => {
      const workspace = resolveWorkspace(globalOpts.workspace);
      const api = new BitbucketAPI(
        process.env.BITBUCKET_USERNAME,
        process.env.BITBUCKET_APP_PASSWORD,
        process.env.BITBUCKET_API_TOKEN,
      );
      const repo = await repositoriesCore.getRepository(api, {
        workspace,
        repo_slug: slug,
      });
      emit(toCtx(globalOpts), repo, () => formatDetail(workspace, repo));
    });

  return cmd;
}

function toCtx(opts: RepoCommandOptions): OutputContext {
  return { json: opts.json };
}

function parseIntOpt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new CliError(`expected integer, got: ${value}`);
  return n;
}

function formatList(workspace: string, result: ListRepositoriesResult): string {
  if (result.items.length === 0) return `No repositories found in '${workspace}'.`;
  const lines = result.items.map(
    (r) =>
      `${r.name}\t${r.is_private ? "private" : "public"}\t${r.language ?? "-"}\t${r.links.html.href}`,
  );
  if (result.next) lines.push(`\nnext: ${result.next}`);
  return lines.join("\n");
}

function formatDetail(workspace: string, repo: GetRepositoryResult): string {
  return [
    `Name: ${repo.name}`,
    `Workspace: ${workspace}`,
    `Description: ${repo.description ?? "(none)"}`,
    `Language: ${repo.language ?? "(unknown)"}`,
    `Private: ${repo.is_private}`,
    `Size: ${repo.size} bytes`,
    `URL: ${repo.links.html.href}`,
  ].join("\n");
}
