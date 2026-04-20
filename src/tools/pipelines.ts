import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BitbucketAPI } from "../bitbucket-api.js";
import { withRequestTracking } from "../utils/request-tracking.js";
import { resolveWorkspace } from "../validation.js";
import logger from "../debug-logger.js";
import { makeRegister } from "./helpers.js";

export function register(server: McpServer, bitbucketAPI: BitbucketAPI) {
  const registerTool = makeRegister(server);

  // Merged: pipelines (list or single based on optional pipeline_uuid)
  registerTool(
    "pipelines",
    "List pipelines for a repository, or get details for a single pipeline when `pipeline_uuid` is provided.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().optional().describe("Pipeline UUID. If provided, returns a single pipeline; otherwise lists all pipelines."),
      page: z.string().optional().describe("(list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("pipelines", async ({ workspace: ws, repo_slug, pipeline_uuid, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (pipeline_uuid) {
        return getPipeline(bitbucketAPI, workspace, repo_slug, pipeline_uuid);
      }
      return listPipelines(bitbucketAPI, workspace, repo_slug, page, pagelen);
    }),
  );

  // Relocated unchanged: trigger-pipeline
  registerTriggerPipeline(registerTool, bitbucketAPI);

  // Merged: pipeline-steps with action enum
  registerTool(
    "pipeline-steps",
    "Pipeline step operations. Use `action: \"list\"` to list all steps, `\"get\"` to fetch a single step's metadata, `\"log\"` to fetch a single step's log output. `step_uuid` is required when `action` is `get` or `log`.",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      pipeline_uuid: z.string().describe("Pipeline UUID"),
      action: z.enum(["list", "get", "log"]).describe("Which operation to perform"),
      step_uuid: z.string().optional().describe("Step UUID. Required when action is `get` or `log`."),
      page: z.string().optional().describe("(action=list only) Page number or opaque next page URL"),
      pagelen: z.number().int().min(10).max(100).optional().describe("(action=list only) Items per page (10-100, default 10)"),
    },
    withRequestTracking("pipeline-steps", async ({ workspace: ws, repo_slug, pipeline_uuid, action, step_uuid, page, pagelen }) => {
      const workspace = resolveWorkspace(ws);
      if (action === "list") {
        return listPipelineSteps(bitbucketAPI, workspace, repo_slug, pipeline_uuid, page, pagelen);
      }
      if (!step_uuid) {
        return {
          content: [{
            type: "text",
            text: `❌ step_uuid is required when action is "get" or "log".`,
          }],
        };
      }
      if (action === "get") {
        return getPipelineStep(bitbucketAPI, workspace, repo_slug, pipeline_uuid, step_uuid);
      }
      return getPipelineStepLog(bitbucketAPI, workspace, repo_slug, pipeline_uuid, step_uuid);
    }),
  );
}

async function listPipelines(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  page?: string,
  pagelen?: number,
) {
  try {
    const result = await api.listPipelines(workspace, repo_slug, page, pagelen);
    const pipelines = result.pipelines;

    if (pipelines.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No pipelines found for repository '${workspace}/${repo_slug}'.`,
          },
        ],
      };
    }

    const pipelineText = pipelines.map((p) => [
      `**Pipeline #${p.build_number}** (${p.uuid})`,
      `  Status: ${p.state?.name || "unknown"}${p.state?.result ? ` | Result: ${p.state.result.name}` : ""}`,
      `  Target: ${p.target?.ref_type || "commit"} ${p.target?.ref_name || p.target?.commit?.hash?.substring(0, 7) || "unknown"}`,
      p.trigger ? `  Trigger: ${p.trigger.name || p.trigger.type}` : null,
      p.variables && p.variables.length > 0
        ? `  Variables: ${p.variables.map(v => v.secured ? `${v.key}=***` : `${v.key}=${v.value ?? ""}`).join(", ")}`
        : null,
      `  Creator: ${p.creator?.display_name || "unknown"} (@${p.creator?.username || "unknown"})`,
      `  Created: ${p.created_on ? new Date(p.created_on).toLocaleString() : "unknown"}`,
      p.completed_on ? `  Completed: ${new Date(p.completed_on).toLocaleString()}` : null,
      p.build_seconds_used !== undefined ? `  Duration: ${Math.floor(p.build_seconds_used / 60)}m ${p.build_seconds_used % 60}s` : null,
      `  URL: ${p.links?.html?.href || "N/A"}`,
      "---",
    ].filter(Boolean).join("\n"));

    const paginationText = [
      result.page !== undefined ? `Page: ${result.page}` : null,
      result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
      result.next ? `Next page: ${result.next}` : null,
    ].filter(Boolean).join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Found ${pipelines.length} pipelines for '${workspace}/${repo_slug}':\n\n${pipelineText.join("\n")}${paginationText ? `\n\n${paginationText}` : ""}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to retrieve pipelines: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}

async function getPipeline(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pipeline_uuid: string,
) {
  try {
    const pipeline = await api.getPipeline(workspace, repo_slug, pipeline_uuid);

    const info = [
      `**Pipeline #${pipeline.build_number}** (${pipeline.uuid})`,
      `**Repository:** ${workspace}/${repo_slug}`,
      `**Status:** ${pipeline.state?.name || "unknown"}${pipeline.state?.result?.name ? ` (${pipeline.state.result.name})` : ""}`,
      `**Created:** ${new Date(pipeline.created_on).toLocaleString()}`,
      pipeline.completed_on ? `**Completed:** ${new Date(pipeline.completed_on).toLocaleString()}` : null,
      pipeline.build_seconds_used !== undefined ? `**Duration:** ${pipeline.build_seconds_used} seconds` : null,
      `**URL:** ${pipeline.links?.html?.href || "N/A"}`,
    ].filter(Boolean);

    return {
      content: [
        {
          type: "text",
          text: info.join("\n"),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("tool-handler", `Failed to execute get-pipeline tool: ${errorMessage}`, {
      workspace,
      repo_slug,
      pipeline_uuid,
    });
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to retrieve pipeline: ${errorMessage}`,
        },
      ],
    };
  }
}

function registerTriggerPipeline(registerTool: ReturnType<typeof makeRegister>, api: BitbucketAPI) {
  registerTool(
    "trigger-pipeline",
    "Trigger a new pipeline for a repository",
    {
      workspace: z.string().optional().describe("Bitbucket workspace name. Falls back to BITBUCKET_WORKSPACE env var if not provided."),
      repo_slug: z.string().describe("Repository slug/name"),
      ref_type: z.enum(["branch", "tag"]).optional().describe("Type of reference (branch or tag)"),
      ref_name: z.string().optional().describe("Name of the branch or tag"),
      commit_hash: z.string().optional().describe("Full hash of the commit to run the pipeline on"),
      selector_type: z.string().optional().describe("Type of selector (e.g., 'custom', 'default')"),
      selector_pattern: z.string().optional().describe("Pattern for the selector (e.g., custom pipeline name)"),
      variables: z.record(z.string(), z.string()).optional().describe("Environment variables for the pipeline (key-value pairs)"),
    },
    withRequestTracking("trigger-pipeline", async ({ workspace: ws, repo_slug, ref_type, ref_name, commit_hash, selector_type, selector_pattern, variables }) => {
      const workspace = resolveWorkspace(ws);
      try {
        // Check if authentication is available for triggering pipelines
        if (!process.env.BITBUCKET_API_TOKEN && (!process.env.BITBUCKET_USERNAME || !process.env.BITBUCKET_APP_PASSWORD)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Authentication required: Triggering a pipeline requires either BITBUCKET_API_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables to be set.",
              },
            ],
          };
        }

        // Validation: Must have either (ref_type + ref_name) OR commit_hash
        if (!(ref_type && ref_name) && !commit_hash) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Invalid parameters: You must provide either both (ref_type and ref_name) or a commit_hash to trigger a pipeline.",
              },
            ],
          };
        }

        // Validation: Selector must have both type and pattern if either is provided
        if ((selector_type && !selector_pattern) || (!selector_type && selector_pattern)) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Invalid parameters: When using a selector, you must provide both 'selector_type' and 'selector_pattern'.",
              },
            ],
          };
        }

        const formattedVariables = variables
          ? Object.entries(variables).map(([key, value]) => ({ key, value: String(value) }))
          : undefined;

        const pipeline = await api.triggerPipeline(workspace, repo_slug, {
          ref_type: ref_type as 'branch' | 'tag',
          ref_name,
          commit_hash,
          selector_type,
          selector_pattern,
          variables: formattedVariables,
        });

        const info = [
          `✅ **Pipeline triggered successfully!**`,
          "",
          `**Pipeline #${pipeline.build_number}** (${pipeline.uuid})`,
          `**Repository:** ${workspace}/${repo_slug}`,
          `**Status:** ${pipeline.state?.name || "unknown"}`,
          pipeline.trigger ? `**Trigger:** ${pipeline.trigger.name || pipeline.trigger.type}` : null,
          pipeline.variables && pipeline.variables.length > 0
            ? `**Variables:** ${pipeline.variables.map(v => v.secured ? `${v.key}=***` : `${v.key}=${v.value ?? ""}`).join(", ")}`
            : null,
          `**Created:** ${pipeline.created_on ? new Date(pipeline.created_on).toLocaleString() : "unknown"}`,
          `**URL:** ${pipeline.links?.html?.href || "N/A"}`,
        ].filter(Boolean);

        return {
          content: [
            {
              type: "text",
              text: info.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to trigger pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    })
  );
}

async function listPipelineSteps(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pipeline_uuid: string,
  page?: string,
  pagelen?: number,
) {
  try {
    const result = await api.listPipelineSteps(workspace, repo_slug, pipeline_uuid, page, pagelen);
    const steps = result.steps;

    if (steps.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No steps found for pipeline '${pipeline_uuid}' in '${workspace}/${repo_slug}'.`,
          },
        ],
      };
    }

    const stepText = steps.map((s) => [
      `**Step: ${s.name || "unnamed"}** (${s.uuid})`,
      `  Status: ${s.state?.name || "unknown"}${s.state?.result ? ` | Result: ${s.state.result.name}` : ""}`,
      s.image ? `  Image: ${s.image.name}` : null,
      s.started_on ? `  Started: ${new Date(s.started_on).toLocaleString()}` : null,
      s.completed_on ? `  Completed: ${new Date(s.completed_on).toLocaleString()}` : null,
      s.duration_in_seconds !== undefined ? `  Duration: ${s.duration_in_seconds}s` : null,
    ].filter(Boolean).join("\n")).join("\n---\n");

    const paginationText = [
      result.page !== undefined ? `Page: ${result.page}` : null,
      result.pagelen !== undefined ? `Page length: ${result.pagelen}` : null,
      result.next ? `Next page: ${result.next}` : null,
    ].filter(Boolean).join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Found ${steps.length} steps for pipeline '${pipeline_uuid}' in '${workspace}/${repo_slug}':\n\n${stepText}${paginationText ? `\n\n${paginationText}` : ""}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to retrieve pipeline steps: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}

async function getPipelineStep(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pipeline_uuid: string,
  step_uuid: string,
) {
  try {
    const step = await api.getPipelineStep(workspace, repo_slug, pipeline_uuid, step_uuid);

    const info = [
      `**Step: ${step.name || "unnamed"}** (${step.uuid})`,
      `**Pipeline:** ${pipeline_uuid}`,
      `**Repository:** ${workspace}/${repo_slug}`,
      `**Status:** ${step.state?.name || "unknown"}${step.state?.result?.name ? ` (${step.state.result.name})` : ""}`,
      step.image ? `**Image:** ${step.image.name}` : null,
      step.started_on ? `**Started:** ${new Date(step.started_on).toLocaleString()}` : null,
      step.completed_on ? `**Completed:** ${new Date(step.completed_on).toLocaleString()}` : null,
      step.duration_in_seconds !== undefined ? `**Duration:** ${step.duration_in_seconds} seconds` : null,
      step.build_seconds_used !== undefined ? `**Build seconds used:** ${step.build_seconds_used}` : null,
      step.max_time !== undefined ? `**Max time:** ${step.max_time} seconds` : null,
      step.trigger ? `**Trigger:** ${step.trigger.type}` : null,
      step.links?.log_file?.href ? `**Log URL:** ${step.links.log_file.href}` : null,
    ].filter(Boolean);

    return {
      content: [
        {
          type: "text",
          text: info.join("\n"),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("tool-handler", `Failed to execute get-pipeline-step tool: ${errorMessage}`, {
      workspace,
      repo_slug,
      pipeline_uuid,
      step_uuid,
    });
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to retrieve pipeline step: ${errorMessage}`,
        },
      ],
    };
  }
}

async function getPipelineStepLog(
  api: BitbucketAPI,
  workspace: string,
  repo_slug: string,
  pipeline_uuid: string,
  step_uuid: string,
) {
  try {
    let log = await api.getPipelineStepLog(workspace, repo_slug, pipeline_uuid, step_uuid);

    const MAX_LOG_SIZE = 100 * 1024; // 100KB
    let truncated = false;
    if (log.length > MAX_LOG_SIZE) {
      log = log.slice(-MAX_LOG_SIZE);
      truncated = true;
    }

    const header = [
      `**Pipeline Step Log**`,
      `**Repository:** ${workspace}/${repo_slug}`,
      `**Pipeline:** ${pipeline_uuid}`,
      `**Step:** ${step_uuid}`,
      truncated ? `\n⚠️ Log truncated to last 100KB (original size exceeded limit)\n` : "",
      "---",
      "",
    ].join("\n");

    return {
      content: [
        {
          type: "text",
          text: header + log,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("tool-handler", `Failed to execute get-pipeline-step-log tool: ${errorMessage}`, {
      workspace,
      repo_slug,
      pipeline_uuid,
      step_uuid,
    });
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to retrieve pipeline step log: ${errorMessage}`,
        },
      ],
    };
  }
}
