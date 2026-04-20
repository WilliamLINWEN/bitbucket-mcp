import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketAPI } from "../bitbucket-api.js";
import { register as registerRepositories } from "./repositories.js";
import { register as registerPullRequests } from "./pull-requests.js";
import { register as registerPrComments } from "./pr-comments.js";
import { register as registerCommits } from "./commits.js";
import { register as registerBranches } from "./branches.js";
import { register as registerIssues } from "./issues.js";
import { register as registerPipelines } from "./pipelines.js";
import { register as registerSearch } from "./search.js";
import { register as registerSystem } from "./system.js";

export function registerTools(server: McpServer, bitbucketAPI: BitbucketAPI) {
  registerRepositories(server, bitbucketAPI);
  registerPullRequests(server, bitbucketAPI);
  registerPrComments(server, bitbucketAPI);
  registerCommits(server, bitbucketAPI);
  registerBranches(server, bitbucketAPI);
  registerIssues(server, bitbucketAPI);
  registerPipelines(server, bitbucketAPI);
  registerSearch(server, bitbucketAPI);
  registerSystem(server, bitbucketAPI);
}
