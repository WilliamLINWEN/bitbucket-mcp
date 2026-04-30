import { describe, it, expect } from "vitest";
import { createApiClient } from "./api-client.js";
import { BitbucketAPI } from "../bitbucket-api.js";

describe("cli/api-client", () => {
  it("returns a BitbucketAPI instance", () => {
    const api = createApiClient();
    expect(api).toBeInstanceOf(BitbucketAPI);
  });
});
