# MCP Tool Consolidation Design

**Date:** 2026-04-20
**Status:** Approved (design phase)
**Target version:** 2.0.0 (major, breaking change)

## Goal

Reduce the number of MCP tools this server exposes from **24 to 16** so clients load less tool-schema context, while keeping tool schemas simple enough that LLMs call them correctly.

## Approach

Hybrid consolidation:
- Merge `list-*` + `get-*` read pairs into a single resource-plural tool with an optional ID parameter.
- Collapse the pipeline-step triplet (`list`, `get`, `log`) into one tool with an `action` enum, because the `log` response shape differs substantially from the others.
- Leave write operations, unpaired reads, and system tools untouched.

No backward-compatibility aliases. This ships as v2.0.0 with a migration note in the changelog.

## Tool Mapping

### Merged (6 new tools replacing 14 old tools)

| New tool | Replaces | Param design |
|---|---|---|
| `repositories` | `list-repositories`, `get-repository` | Optional `repo_slug`. Present → single repo. Absent → list. |
| `pull-requests` | `list-pull-requests`, `get-pull-request` | Optional `pr_id`. |
| `pr-comments` | `list-pr-comments`, `get-pr-comment` | Required `pr_id`; optional `comment_id`. |
| `commits` | `get-commits`, `get-commit` | Optional `commit_hash`. |
| `pipelines` | `list-pipelines`, `get-pipeline` | Optional `pipeline_uuid`. |
| `pipeline-steps` | `list-pipeline-steps`, `get-pipeline-step`, `get-pipeline-step-log` | Required `action: "list" \| "get" \| "log"`; required `pipeline_uuid`; required `step_uuid` when `action` is `get` or `log`. |

### Unchanged (10 tools)

Write operations and independent reads remain as-is:

- `create-pull-request`, `update-pr-description`, `create-pr-comment`, `trigger-pipeline` — write ops with payload shapes distinct enough that merging would complicate schemas.
- `get-pr-diff` — returns raw diff text, not PR metadata.
- `list-branches`, `list-issues` — no paired `get-*` in current API surface.
- `search` — cross-resource, independent.
- `health-check`, `get-metrics` — system-level, not tied to any resource.

## Input Schema Rules

- Merged read tools use simple optional parameters — no `oneOf` / discriminator.
- Only `pipeline-steps` uses an enum-discriminated schema. Validation:
  - `action: "list"` → only `pipeline_uuid` required.
  - `action: "get"` or `"log"` → both `pipeline_uuid` and `step_uuid` required.
  - Reject with a clear error if required fields for the chosen `action` are missing.

## Output Shape

List vs. single responses intentionally return different structures (array/paginated envelope vs. single object). Each tool's description must state both shapes clearly so LLM callers know what to expect.

## File Organization

Current `src/tools/index.ts` is 1758 lines with 24 inline tool registrations. After consolidation, split by resource:

```
src/tools/
  index.ts              # registerTools() — orchestration only
  repositories.ts       # repositories tool
  pull-requests.ts      # pull-requests, create-pull-request,
                        # update-pr-description, get-pr-diff
  pr-comments.ts        # pr-comments, create-pr-comment
  commits.ts            # commits
  branches.ts           # list-branches
  issues.ts             # list-issues
  pipelines.ts          # pipelines, trigger-pipeline,
                        # pipeline-steps
  search.ts             # search
  system.ts             # health-check, get-metrics
```

Each module exports a `register(server, api)` function. `index.ts` calls them in sequence.

## Testing

- Split `src/tools/index.test.ts` to mirror the new file layout, or keep one file with `describe` blocks per tool — implementer's choice, pick whichever keeps individual files under ~500 lines.
- Per merged tool, cover:
  - List branch (no ID parameter).
  - Single branch (ID parameter provided).
  - Error path (invalid parameter combinations).
- `pipeline-steps` specifically: one test per `action` value plus one test per rejected invalid action/parameter combination.

## Documentation & Release

- Update `README.md` tool list.
- Update `CONFIGURATION.md` if it lists tools.
- Add a migration table to the changelog: old tool → new tool + param shape.
- Bump `package.json` from `1.4.x` to `2.0.0`.

## Out of Scope

- Merging write operations into their resource tools.
- Consolidating `search`, `list-branches`, `list-issues` (no paired reads).
- Monitoring / metrics refactor.
- Response-shape normalization beyond what merging requires.

## Success Criteria

- `src/tools/index.ts` registers exactly 16 tools.
- All existing integration tests (adjusted for renamed tools) pass.
- `pipeline-steps` rejects invalid `action`/parameter combinations with a clear error.
- Published package version is `2.0.0`.
- README and changelog reflect the new tool surface and migration path.
