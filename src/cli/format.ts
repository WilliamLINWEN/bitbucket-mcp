export interface OutputContext {
  json: boolean;
  pretty: boolean;
}

export function emit(ctx: OutputContext, data: unknown, text: () => string): void {
  if (ctx.json) {
    process.stdout.write(
      JSON.stringify(data, null, ctx.pretty ? 2 : 0) + "\n",
    );
  } else {
    process.stdout.write(text() + "\n");
  }
}
