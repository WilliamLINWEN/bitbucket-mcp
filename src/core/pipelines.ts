import type { BitbucketAPI } from "../bitbucket-api.js";
import type {
  ListPipelinesInput, ListPipelinesResult,
  GetPipelineInput, GetPipelineResult,
  TriggerPipelineInput, TriggerPipelineResult,
  ListPipelineStepsInput, ListPipelineStepsResult,
  GetPipelineStepInput, GetPipelineStepResult,
  GetPipelineStepLogInput, GetPipelineStepLogResult,
} from "./types.js";

export async function listPipelines(
  api: BitbucketAPI, input: ListPipelinesInput,
): Promise<ListPipelinesResult> {
  const result = await api.listPipelines(input.workspace, input.repo_slug, input.page, input.pagelen);
  return {
    items: result.pipelines,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getPipeline(
  api: BitbucketAPI, input: GetPipelineInput,
): Promise<GetPipelineResult> {
  return api.getPipeline(input.workspace, input.repo_slug, input.pipeline_uuid);
}

export async function triggerPipeline(
  api: BitbucketAPI, input: TriggerPipelineInput,
): Promise<TriggerPipelineResult> {
  return api.triggerPipeline(input.workspace, input.repo_slug, {
    ref_type: input.ref_type,
    ref_name: input.ref_name,
    commit_hash: input.commit_hash,
    selector_type: input.selector_type,
    selector_pattern: input.selector_pattern,
    variables: input.variables,
  });
}

export async function listPipelineSteps(
  api: BitbucketAPI, input: ListPipelineStepsInput,
): Promise<ListPipelineStepsResult> {
  const result = await api.listPipelineSteps(
    input.workspace, input.repo_slug, input.pipeline_uuid, input.page, input.pagelen,
  );
  return {
    items: result.steps,
    page: result.page,
    pagelen: result.pagelen,
    next: result.next,
    hasMore: result.hasMore,
  };
}

export async function getPipelineStep(
  api: BitbucketAPI, input: GetPipelineStepInput,
): Promise<GetPipelineStepResult> {
  return api.getPipelineStep(
    input.workspace, input.repo_slug, input.pipeline_uuid, input.step_uuid,
  );
}

export async function getPipelineStepLog(
  api: BitbucketAPI, input: GetPipelineStepLogInput,
): Promise<GetPipelineStepLogResult> {
  const log = await api.getPipelineStepLog(
    input.workspace, input.repo_slug, input.pipeline_uuid, input.step_uuid,
  );
  return { log };
}
