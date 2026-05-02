import { Command } from "commander";
import * as searchCore from "../../core/search.js";
import type { SearchType } from "../../core/types.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import { action } from "../action.js";
import { parseIntOpt } from "../utils.js";

const VALID_TYPES: SearchType[] = ["repositories", "pull-requests", "issues", "commits"];
const DEFAULT_TYPES: SearchType[] = ["repositories", "pull-requests", "issues"];

export interface SearchCommandOptions {
  json: boolean;
  pretty: boolean;
  workspace?: string;
}

export function buildSearchCommand(globalOpts: SearchCommandOptions): Command {
  const cmd = new Command("search").description("Search across repositories, pull requests, issues, and commits");
  const ctx = (): OutputContext => ({ json: globalOpts.json, pretty: globalOpts.pretty });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.argument("<query>", "Search query")
    .option(
      "--types <list>",
      `Comma-separated types to search (${VALID_TYPES.join("|")})`,
      (val: string) => parseTypes(val),
      DEFAULT_TYPES,
    )
    .option("--limit <n>", "Max results per type (1-50)", parseIntOpt, 10)
    .action(action(async (query: string, opts) => {
      const result = await searchCore.search(createApiClient(), {
        workspace: ws(),
        query,
        types: opts.types,
        limit: opts.limit,
      });
      emit(ctx(), result, () => {
        const lines: string[] = [];
        const { hits, sections } = result;

        // Report section summaries
        for (const section of sections) {
          lines.push(`${section.type}: ${countHits(hits, section.type)} hits`);
          const moreSuffix = section.hasMoreRepos ? " (more available)" : "";
          lines.push(`  searched ${section.searched} of ${section.totalRepos} repos${moreSuffix}`);
          if (section.errors.length > 0) {
            for (const { repo, message } of section.errors) {
              lines.push(`  ! ${repo}: ${message}`);
            }
          }
        }

        // Print first few items per type
        if (hits.repositories.length > 0) {
          lines.push("");
          lines.push(listHeader("Repositories", hits.repositories.length));
          hits.repositories.slice(0, 5).forEach(({ item: repo }) => {
            lines.push(`  ${repo.name} — ${repo.description || "(no description)"}`);
          });
        }

        if (hits.pullRequests.length > 0) {
          lines.push("");
          lines.push(listHeader("Pull Requests", hits.pullRequests.length));
          hits.pullRequests.slice(0, 5).forEach(({ item: pr, repo }) => {
            lines.push(`  [${repo}] PR #${pr.id}: ${pr.title} (${pr.state})`);
          });
        }

        if (hits.issues.length > 0) {
          lines.push("");
          lines.push(listHeader("Issues", hits.issues.length));
          hits.issues.slice(0, 5).forEach(({ item: issue, repo }) => {
            lines.push(`  [${repo}] #${issue.id}: ${issue.title} (${issue.state})`);
          });
        }

        if (hits.commits.length > 0) {
          lines.push("");
          lines.push(listHeader("Commits", hits.commits.length));
          hits.commits.slice(0, 5).forEach(({ item: commit, repo }) => {
            lines.push(`  [${repo}] ${commit.hash.substring(0, 8)}: ${commit.message.split("\n")[0].slice(0, 60)}`);
          });
        }

        if (result.totalHits === 0) {
          return `No results found for "${query}"`;
        }

        return lines.join("\n");
      });
    }));

  return cmd;
}

function listHeader(label: string, total: number): string {
  const shown = Math.min(5, total);
  return shown < total ? `${label} (showing ${shown} of ${total}):` : `${label}:`;
}

function countHits(
  hits: { repositories: unknown[]; pullRequests: unknown[]; issues: unknown[]; commits: unknown[] },
  type: SearchType,
): number {
  switch (type) {
    case "repositories": return hits.repositories.length;
    case "pull-requests": return hits.pullRequests.length;
    case "issues": return hits.issues.length;
    case "commits": return hits.commits.length;
  }
}

function parseTypes(val: string): SearchType[] {
  return val.split(",").map((t) => {
    const trimmed = t.trim() as SearchType;
    if (!VALID_TYPES.includes(trimmed)) {
      throw new CliError(`Invalid type "${trimmed}". Valid types: ${VALID_TYPES.join(", ")}`);
    }
    return trimmed;
  });
}

