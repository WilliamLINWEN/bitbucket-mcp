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

/**
 * Hint string injected into JSON output (`_hint` sibling of `items`) when
 * a paginated response carries a `next` cursor. The underscore prefix marks
 * it as adapter-added metadata (not from the Bitbucket API). Consumers that
 * strict-validate JSON should whitelist `_hint`.
 */
const NEXT_PAGE_HINT = "More results: re-invoke with --page=<value of next>.";

/**
 * Emit a paginated CLI result. Keys off `result.next` (not `result.hasMore`)
 * because `hasMore` can be true without a usable cursor in page-number-based
 * paging; `next` is the only signal that the user can act on directly.
 */
export function emitPaginated<T extends { next?: string }>(
  ctx: OutputContext,
  result: T,
  text: () => string,
): void {
  if (ctx.json) {
    const data = result.next ? { ...result, _hint: NEXT_PAGE_HINT } : result;
    process.stdout.write(JSON.stringify(data, null, ctx.pretty ? 2 : 0) + "\n");
  } else {
    const body = text();
    const tail = result.next ? `\n\nnext page: --page '${result.next}'` : "";
    process.stdout.write(body + tail + "\n");
  }
}
