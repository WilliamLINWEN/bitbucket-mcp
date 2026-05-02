import { Command } from "commander";
import * as pipelinesCore from "../../core/pipelines.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, emitPaginated, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import { action } from "../action.js";
import { propagateExitOverride, parsePagelenOpt, parseNonNegativeIntOpt } from "../utils.js";

export interface PipelineCommandOptions {
  json: boolean;
  pretty: boolean;
  workspace?: string;
}

export function buildPipelineCommand(globalOpts: PipelineCommandOptions): Command {
  const cmd = new Command("pipeline").description("Pipeline operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json, pretty: globalOpts.pretty });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List pipelines for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (opts) => {
      const result = await pipelinesCore.listPipelines(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        page: opts.page, pagelen: opts.pagelen,
      });
      emitPaginated(ctx(), result, () =>
        result.items.map((p) =>
          `#${p.build_number}\t${p.state?.name ?? "unknown"}\t${p.uuid}`,
        ).join("\n") || "(no pipelines)",
      );
    }));

  cmd.command("view <uuid>")
    .description("Show details for a single pipeline")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (uuid: string, opts) => {
      const p = await pipelinesCore.getPipeline(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo, pipeline_uuid: uuid,
      });
      emit(ctx(), p, () => [
        `#${p.build_number} (${p.uuid})`,
        `state: ${p.state?.name ?? "unknown"}`,
        `url: ${p.links?.html?.href ?? "(none)"}`,
      ].join("\n"));
    }));

  cmd.command("trigger")
    .description("Trigger a new pipeline")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--branch <name>", "Branch ref to trigger on")
    .option("--tag <name>", "Tag ref to trigger on")
    .option("--commit <hash>", "Commit hash to trigger on")
    .option("--selector-type <type>", "Selector type (e.g. custom)")
    .option("--selector-pattern <pattern>", "Selector pattern")
    .option("--var <key=value...>", "Pipeline variable (repeatable)")
    .action(action(async (opts) => {
      const refsProvided = [opts.branch, opts.tag, opts.commit].filter(Boolean).length;
      if (refsProvided !== 1) {
        throw new CliError(
          "Provide exactly one of --branch, --tag, or --commit (mutually exclusive)",
        );
      }
      let ref_type: "branch" | "tag" | undefined;
      let ref_name: string | undefined;
      if (opts.branch) {
        ref_type = "branch";
        ref_name = opts.branch;
      } else if (opts.tag) {
        ref_type = "tag";
        ref_name = opts.tag;
      }
      const variables = parseVariables(opts.var);
      const p = await pipelinesCore.triggerPipeline(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        ref_type, ref_name,
        commit_hash: opts.commit,
        selector_type: opts.selectorType,
        selector_pattern: opts.selectorPattern,
        variables,
      });
      emit(ctx(), p, () => `triggered pipeline #${p.build_number} (${p.uuid})`);
    }));

  const step = cmd.command("step").description("Pipeline step operations");

  step.command("list <pipelineUuid>")
    .description("List steps for a pipeline")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parsePagelenOpt)
    .action(action(async (pipelineUuid: string, opts) => {
      const result = await pipelinesCore.listPipelineSteps(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo, pipeline_uuid: pipelineUuid,
        page: opts.page, pagelen: opts.pagelen,
      });
      emitPaginated(ctx(), result, () =>
        result.items.map((s) =>
          `${s.uuid}\t${s.name ?? "unnamed"}\t${s.state?.name ?? "unknown"}`,
        ).join("\n") || "(no steps)",
      );
    }));

  step.command("view <pipelineUuid> <stepUuid>")
    .description("Show details for a single pipeline step")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (pipelineUuid: string, stepUuid: string, opts) => {
      const s = await pipelinesCore.getPipelineStep(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pipeline_uuid: pipelineUuid, step_uuid: stepUuid,
      });
      emit(ctx(), s, () => [
        `step: ${s.name ?? "unnamed"} (${s.uuid})`,
        `state: ${s.state?.name ?? "unknown"}`,
        s.image ? `image: ${s.image.name}` : "",
      ].filter(Boolean).join("\n"));
    }));

  const logCmd = step.command("log <pipelineUuid> <stepUuid>")
    .description("Print the log for a pipeline step (default: last 500 lines; --tail 0 = unlimited)")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--tail <n>", "Print only the last N lines (0 = unlimited; default 500)", parseNonNegativeIntOpt)
    .option("--head <n>", "Print only the first N lines (0 = unlimited)", parseNonNegativeIntOpt);
  logCmd.action(action(async (pipelineUuid: string, stepUuid: string, opts) => {
    const userPassedTail = logCmd.getOptionValueSource("tail") === "cli";
    const userPassedHead = logCmd.getOptionValueSource("head") === "cli";
    if (userPassedTail && userPassedHead) {
      throw new CliError("--tail and --head are mutually exclusive");
    }
    const tail = userPassedHead ? undefined : (opts.tail ?? 500);
    const head = userPassedHead ? opts.head : undefined;
    const result = await pipelinesCore.getPipelineStepLog(createApiClient(), {
      workspace: ws(), repo_slug: opts.repo,
      pipeline_uuid: pipelineUuid, step_uuid: stepUuid,
    });
    const { log: shown, truncatedLines } = applyTailHead(result.log, tail, head);
    const notice = truncatedLines > 0
      ? userPassedHead
        ? `\n(truncated: ${truncatedLines} later lines — re-run with --head 0 for full log)`
        : `\n(truncated: ${truncatedLines} earlier lines — re-run with --tail 0 for full log)`
      : "";
    emit(ctx(), { ...result, log: shown, truncatedLines }, () => shown + notice);
  }));

  propagateExitOverride(cmd);
  return cmd;
}

function applyTailHead(log: string, tail?: number, head?: number): { log: string; truncatedLines: number } {
  // Strip a single trailing newline before splitting so a 500-line log ending
  // in "\n" doesn't read as 501 elements (which would falsely report truncation).
  const normalized = log.endsWith("\n") ? log.slice(0, -1) : log;
  const lines = normalized.split("\n");
  if (head !== undefined && head > 0 && lines.length > head) {
    return { log: lines.slice(0, head).join("\n"), truncatedLines: lines.length - head };
  }
  if (tail !== undefined && tail > 0 && lines.length > tail) {
    return { log: lines.slice(-tail).join("\n"), truncatedLines: lines.length - tail };
  }
  return { log, truncatedLines: 0 };
}

function parseVariables(values: string[] | undefined): Array<{ key: string; value: string }> | undefined {
  if (!values || values.length === 0) return undefined;
  return values.map((entry) => {
    const eq = entry.indexOf("=");
    if (eq < 0) throw new CliError(`--var must be key=value, got: ${entry}`);
    return { key: entry.slice(0, eq), value: entry.slice(eq + 1) };
  });
}
