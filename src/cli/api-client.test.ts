import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApiClient } from "./api-client.js";
import { BitbucketAPI } from "../bitbucket-api.js";
import { CliError, AUTH_HINT } from "./errors.js";

describe("cli/api-client", () => {
  beforeEach(() => {
    process.env.BITBUCKET_API_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.BITBUCKET_API_TOKEN;
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_APP_PASSWORD;
  });

  it("returns a BitbucketAPI instance", () => {
    const api = createApiClient();
    expect(api).toBeInstanceOf(BitbucketAPI);
  });

  it("throws CliError containing AUTH_HINT when all auth env vars are unset", () => {
    delete process.env.BITBUCKET_API_TOKEN;
    expect(() => createApiClient()).toThrow(CliError);
    expect(() => createApiClient()).toThrow(AUTH_HINT);
  });

  it("succeeds when only BITBUCKET_API_TOKEN is set", () => {
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_APP_PASSWORD;
    const api = createApiClient();
    expect(api).toBeInstanceOf(BitbucketAPI);
  });

  it("succeeds when only BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD are set", () => {
    delete process.env.BITBUCKET_API_TOKEN;
    process.env.BITBUCKET_USERNAME = "user";
    process.env.BITBUCKET_APP_PASSWORD = "pass";
    const api = createApiClient();
    expect(api).toBeInstanceOf(BitbucketAPI);
  });

  it("succeeds when BITBUCKET_USERNAME + BITBUCKET_API_TOKEN are set", () => {
    process.env.BITBUCKET_USERNAME = "user";
    // BITBUCKET_API_TOKEN already set in beforeEach
    const api = createApiClient();
    expect(api).toBeInstanceOf(BitbucketAPI);
  });

  it("createApiClient({ allowMissingCreds: true }) returns a client even with no env vars", () => {
    delete process.env.BITBUCKET_API_TOKEN;
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_APP_PASSWORD;
    const api = createApiClient({ allowMissingCreds: true });
    expect(api).toBeInstanceOf(BitbucketAPI);
  });
});
