import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as repositoriesCore from "./repositories.js";
import { authStatus } from "./system.js";

// Build a minimal fake API that satisfies the getAuthMethod() contract.
function makeFakeApi(authMethod: "token" | "basic" | "none") {
  return {
    getAuthMethod: vi.fn().mockResolvedValue(authMethod),
  } as any;
}

describe("core authStatus", () => {
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

  it("returns authMethod:token, reachable:true, authenticated:true when getAuthMethod returns 'token' and repos call resolves", async () => {
    const fakeApi = makeFakeApi("token");
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

  it("returns authMethod:none, reachable:true, authenticated:false when getAuthMethod returns 'none' and repos call resolves", async () => {
    const fakeApi = makeFakeApi("none");
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

  it("returns reachable:false, authenticated:false when repos call rejects (even when getAuthMethod returns 'basic')", async () => {
    const fakeApi = makeFakeApi("basic");
    vi.spyOn(repositoriesCore, "listRepositories").mockRejectedValue(
      new Error("Network failure"),
    );

    const result = await authStatus(fakeApi, { workspace: "broken" });

    expect(result.reachable).toBe(false);
    expect(result.authMethod).toBe("basic");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Network failure");
    expect(result.workspaceTested).toBe("broken");
  });

  it("authenticated:false on probe failure even when getAuthMethod returns 'token'", async () => {
    const fakeApi = makeFakeApi("token");
    vi.spyOn(repositoriesCore, "listRepositories").mockRejectedValue(
      new Error("Failed to fetch data: 401 Unauthorized"),
    );

    const result = await authStatus(fakeApi, { workspace: "acme" });

    expect(result.authenticated).toBe(false);
    expect(result.authMethod).toBe("token");
    expect(result.reachable).toBe(false);
  });

  it("defaults workspaceTested to BITBUCKET_WORKSPACE env var when no workspace input provided", async () => {
    process.env.BITBUCKET_WORKSPACE = "my-org";
    const fakeApi = makeFakeApi("none");
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, {});

    expect(result.workspaceTested).toBe("my-org");
  });

  it("returns authMethod:basic when getAuthMethod returns 'basic' and probe succeeds", async () => {
    const fakeApi = makeFakeApi("basic");
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, { workspace: "acme" });

    expect(result.authMethod).toBe("basic");
    expect(result.authenticated).toBe(true);
  });

  it("defaults workspaceTested to 'atlassian' when neither workspace input nor env var provided", async () => {
    const fakeApi = makeFakeApi("none");
    vi.spyOn(repositoriesCore, "listRepositories").mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await authStatus(fakeApi, {});

    expect(result.workspaceTested).toBe("atlassian");
  });
});
