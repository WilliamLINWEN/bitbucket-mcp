export interface OutputContext {
  json: boolean;
}

export function emit(ctx: OutputContext, data: unknown, text: () => string): void {
  if (ctx.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(text() + "\n");
  }
}
