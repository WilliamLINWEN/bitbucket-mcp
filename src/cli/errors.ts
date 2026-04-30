export class CliError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = "CliError";
  }
}

export function reportAndExit(error: unknown): never {
  if (error instanceof CliError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(error.exitCode);
  }
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}
