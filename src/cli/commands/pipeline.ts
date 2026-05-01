import { Command } from "commander";
import * as pipelinesCore from "../../core/pipelines.js";
import { resolveWorkspace } from "../../validation.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { CliError } from "../errors.js";
import { action } from "../action.js";
import { propagateExitOverride } from "../utils.js";

export interface PipelineCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildPipelineCommand(globalOpts: PipelineCommandOptions): Command {
  const cmd = new Command("pipeline").description("Pipeline operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json });
  const ws = (): string => resolveWorkspace(globalOpts.workspace);

  cmd.command("list")
    .description("List pipelines for a repository")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .option("--page <page>", "Page number or opaque next URL")
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(action(async (opts) => {
      const result = await pipelinesCore.listPipelines(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        page: opts.page, pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
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
      let ref_type: "branch" | "tag" | undefined;
      let ref_name: string | undefined;
      if (opts.branch) {
        ref_type = "branch";
        ref_name = opts.branch;
      } else if (opts.tag) {
        ref_type = "tag";
        ref_name = opts.tag;
      }
      if (!ref_name && !opts.commit) {
        throw new CliError("Provide --branch, --tag, or --commit");
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
    .option("--pagelen <n>", "Items per page (10-100)", parseIntOpt)
    .action(action(async (pipelineUuid: string, opts) => {
      const result = await pipelinesCore.listPipelineSteps(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo, pipeline_uuid: pipelineUuid,
        page: opts.page, pagelen: opts.pagelen,
      });
      emit(ctx(), result, () =>
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

  step.command("log <pipelineUuid> <stepUuid>")
    .description("Print the log for a pipeline step")
    .requiredOption("-r, --repo <slug>", "Repository slug")
    .action(action(async (pipelineUuid: string, stepUuid: string, opts) => {
      const result = await pipelinesCore.getPipelineStepLog(createApiClient(), {
        workspace: ws(), repo_slug: opts.repo,
        pipeline_uuid: pipelineUuid, step_uuid: stepUuid,
      });
      emit(ctx(), result, () => result.log);
    }));

  propagateExitOverride(cmd);
  return cmd;
}

// TODO: replace with shared utils.ts versions
function parseIntOpt(v: string): number {
  if (!/^-?\d+$/.test(v)) throw new CliError(`expected integer, got: ${v}`);
  return Number.parseInt(v, 10);
}

function parseVariables(values: string[] | undefined): Array<{ key: string; value: string }> | undefined {
  if (!values || values.length === 0) return undefined;
  return values.map((entry) => {
    const eq = entry.indexOf("=");
    if (eq < 0) throw new CliError(`--var must be key=value, got: ${entry}`);
    return { key: entry.slice(0, eq), value: entry.slice(eq + 1) };
  });
}
