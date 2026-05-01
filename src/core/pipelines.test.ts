import { describe, it, expect, vi } from "vitest";
import {
  listPipelines, getPipeline, triggerPipeline,
  listPipelineSteps, getPipelineStep, getPipelineStepLog,
} from "./pipelines.js";
import type { BitbucketAPI } from "../bitbucket-api.js";

const fakeApi = (overrides: Partial<BitbucketAPI>): BitbucketAPI =>
  overrides as unknown as BitbucketAPI;

describe("core/pipelines", () => {
  it("listPipelines reshapes pipelines → items", async () => {
    const api = fakeApi({
      listPipelines: vi.fn().mockResolvedValue({
        pipelines: [{ uuid: "p1" } as any],
        page: 1, pagelen: 10, next: undefined, hasMore: false,
      }),
    });
    const result = await listPipelines(api, { workspace: "acme", repo_slug: "r1" });
    expect(result.items).toEqual([{ uuid: "p1" }]);
    expect(api.listPipelines).toHaveBeenCalledWith("acme", "r1", undefined, undefined);
  });

  it("getPipeline delegates", async () => {
    const api = fakeApi({ getPipeline: vi.fn().mockResolvedValue({ uuid: "p1" }) });
    const p = await getPipeline(api, { workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1" });
    expect(p).toEqual({ uuid: "p1" });
    expect(api.getPipeline).toHaveBeenCalledWith("acme", "r1", "p1");
  });

  it("triggerPipeline forwards documented fields", async () => {
    const api = fakeApi({ triggerPipeline: vi.fn().mockResolvedValue({ uuid: "p2" }) });
    await triggerPipeline(api, {
      workspace: "acme", repo_slug: "r1",
      ref_type: "branch", ref_name: "main",
      variables: [{ key: "K", value: "V" }],
    });
    expect(api.triggerPipeline).toHaveBeenCalledWith("acme", "r1", {
      ref_type: "branch", ref_name: "main",
      commit_hash: undefined, selector_type: undefined, selector_pattern: undefined,
      variables: [{ key: "K", value: "V" }],
    });
  });

  it("listPipelineSteps reshapes steps → items", async () => {
    const api = fakeApi({
      listPipelineSteps: vi.fn().mockResolvedValue({
        steps: [{ uuid: "s1" } as any],
        page: 1, pagelen: 10, next: undefined, hasMore: false,
      }),
    });
    const result = await listPipelineSteps(api, {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1",
    });
    expect(result.items).toEqual([{ uuid: "s1" }]);
    expect(api.listPipelineSteps).toHaveBeenCalledWith("acme", "r1", "p1", undefined, undefined);
  });

  it("getPipelineStep delegates", async () => {
    const api = fakeApi({
      getPipelineStep: vi.fn().mockResolvedValue({ uuid: "s1" }),
    });
    const s = await getPipelineStep(api, {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1", step_uuid: "s1",
    });
    expect(s).toEqual({ uuid: "s1" });
    expect(api.getPipelineStep).toHaveBeenCalledWith("acme", "r1", "p1", "s1");
  });

  it("getPipelineStepLog wraps the string in { log }", async () => {
    const api = fakeApi({
      getPipelineStepLog: vi.fn().mockResolvedValue("LOGS"),
    });
    const result = await getPipelineStepLog(api, {
      workspace: "acme", repo_slug: "r1", pipeline_uuid: "p1", step_uuid: "s1",
    });
    expect(result).toEqual({ log: "LOGS" });
  });
});
