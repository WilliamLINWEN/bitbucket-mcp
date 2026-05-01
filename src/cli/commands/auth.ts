import { Command } from "commander";
import * as systemCore from "../../core/system.js";
import { createApiClient } from "../api-client.js";
import { emit, OutputContext } from "../format.js";
import { action } from "../action.js";

export interface AuthCommandOptions {
  json: boolean;
  workspace?: string;
}

export function buildAuthCommand(globalOpts: AuthCommandOptions): Command {
  const cmd = new Command("auth").description("Authentication operations");
  const ctx = (): OutputContext => ({ json: globalOpts.json });

  cmd.command("status")
    .description("Show authentication status and connectivity to Bitbucket")
    .action(action(async () => {
      const result = await systemCore.authStatus(createApiClient(), {
        workspace: globalOpts.workspace,
      });
      emit(ctx(), result, () => [
        `auth: ${result.authMethod}`,
        `workspace tested: ${result.workspaceTested}`,
        `reachable: ${result.reachable ? "yes" : "no"}`,
        result.error ? `error: ${result.error}` : "",
      ].filter(Boolean).join("\n"));
    }));

  cmd.command("login")
    .description("Show how to authenticate (placeholder for future keychain support)")
    .action(() => {
      const text =
        "Set BITBUCKET_API_TOKEN in your environment to authenticate.\n" +
        "Generate a token at https://bitbucket.org/account/settings/api-tokens/\n" +
        "Example: export BITBUCKET_API_TOKEN=<your-token>";
      emit(ctx(), { method: "env-var", instructions: text }, () => text);
    });

  cmd.command("logout")
    .description("Show how to log out (placeholder)")
    .action(() => {
      const text = "Unset BITBUCKET_API_TOKEN to log out:\n  unset BITBUCKET_API_TOKEN";
      emit(ctx(), { method: "env-var", instructions: text }, () => text);
    });

  return cmd;
}
