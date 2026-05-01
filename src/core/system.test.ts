import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as repositoriesCore from "./repositories.js";
import { authStatus } from "./system.js";

describe("core authStatus", () => {
  const fakeApi = {} as any;

  beforeEach(() => {
    // Clean auth env vars before each test
    delete process.env.BITBUCKET_API_TOKEN;
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_APP_PASSWORD;
    delete process.env.BITBUCKET_WORKSPACE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BITBUCKET_API_TOKEN;
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_APP_PASSWORD;
    delete process.env.BITBUCKET_WORKSPACE;
  });

  it("returns authMethod:token, reachable:true, authenticated:true when token env is set and repos call resolves", async () => {
    process.env.BITBUCKET_API_TOKEN = "test-token";
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, { workspace: "acme" });

    expect(result).toEqual({
      authenticated: true,
      authMethod: "token",
      workspaceTested: "acme",
      reachable: true,
    });
  });

  it("returns authMethod:none, reachable:true, authenticated:false when no env auth is set and repos call resolves", async () => {
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, { workspace: "atlassian" });

    expect(result).toEqual({
      authenticated: false,
      authMethod: "none",
      workspaceTested: "atlassian",
      reachable: true,
    });
  });

  it("returns reachable:false and error populated when repos call rejects", async () => {
    process.env.BITBUCKET_USERNAME = "user";
    process.env.BITBUCKET_APP_PASSWORD = "pass";
    vi.spyOn(repositoriesCore, "listRepositories").mockRejectedValue(
      new Error("Network failure"),
    );

    const result = await authStatus(fakeApi, { workspace: "broken" });

    expect(result.reachable).toBe(false);
    expect(result.authMethod).toBe("basic");
    expect(result.authenticated).toBe(true);
    expect(result.error).toBe("Network failure");
    expect(result.workspaceTested).toBe("broken");
  });

  it("defaults workspaceTested to BITBUCKET_WORKSPACE env var when no workspace input provided", async () => {
    process.env.BITBUCKET_WORKSPACE = "my-org";
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, {});

    expect(result.workspaceTested).toBe("my-org");
  });

  it("returns authMethod:basic when username+apiToken are both set (matches actual Basic header sent)", async () => {
    process.env.BITBUCKET_USERNAME = "alice";
    process.env.BITBUCKET_API_TOKEN = "tok";
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, { workspace: "acme" });

    expect(result.authMethod).toBe("basic");
    expect(result.authenticated).toBe(true);
  });

  it("defaults workspaceTested to 'atlassian' when neither workspace input nor env var provided", async () => {
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, {});

    expect(result.workspaceTested).toBe("atlassian");
  });
});
