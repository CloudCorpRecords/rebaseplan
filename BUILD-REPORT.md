# rebaseplan — Build Report

MCP Rebuild 1000, Batch 17. Original program build from the
packages-100 plan (cluster A #11), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch17/rebaseplan.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `rebaseplan`, npm `@reneturcios/rebaseplan`,
MCP name `io.github.CloudCorpRecords/rebaseplan`, version
`0.1.0`, bin `rebaseplan` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Plan a safe
  rebase: squash history and force-push risk flagged before
  you start." — 80 chars, verified by count; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/rebaseplan:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/rebaseplan"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`plan --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/rebaseplan.ts` (core,
  `VERSION = "0.1.0"`, also exporting the pinned
  `isSquashMarker`)
- `test/rebaseplan.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/rebaseplan`,
  smoke-test server-name assertion `rebaseplan`)

Plus the parity fixture at
`harness/fixtures/rebaseplan-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster A #11.

## Tools implemented (1)

- `plan_rebase` — arguments: `commits` (array, required,
  non-empty; each entry `{hash, subject, merge?}` with
  non-empty string `hash`/`subject` and boolean `merge`
  defaulting to false), `upstream_commits` (array, optional,
  default `[]`; each entry `{hash, subject}`), and
  `published` (boolean, optional, default false). The schema
  literal carries the nested item schemas for both arrays
  exactly as defined.

  Counting is pinned: `merge_commits` counts `commits`
  entries with `merge` true; a squash marker is a `commits`
  entry whose subject starts with "Squashed commit" or
  matches `/\(#\d+\)$/` (upstream commits are never
  counted); `upstream_new_commits` is the upstream array's
  length. Force-push risk is pinned: unpublished → "low";
  published with no merges and no markers → "medium";
  published with either → "high". Strategy is first-match:
  merges → "rebase_with_merge_preservation", else markers →
  "interactive_squash_cleanup", else "linear_rebase".
  Steps and warnings are the pinned strings in the pinned
  order, including the fixed upstream warning text at
  `upstream_new_commits >= 10`. Returns `{commit_count,
  merge_commits, squash_markers, upstream_new_commits,
  published, force_push_risk, recommended_strategy, steps,
  warnings}`.

  The fixture literal
  (`harness/fixtures/rebaseplan-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties` — confirmed by the parity
  run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object (`{commits, upstream_commits?,
  published?}`).
- Validation is path-naming and total: a missing, non-array,
  or empty `commits`; a non-object entry or an entry with a
  missing, empty, or non-string `hash`/`subject` or a
  non-boolean `merge` (paths like `commits[1].hash`); a
  non-array `upstream_commits` or a badly typed entry
  (paths like `upstream_commits[0].subject`); or a
  non-boolean `published` throws an Error naming the
  offending path and produces no partial result (MCP:
  `isError`; CLI: exit 1).

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **49 tests,
  49 pass, 0 fail** — squash-marker pins (both forms, plus
  near-misses: a suffix not at the end including a trailing
  space, non-digit suffixes `(#abc)` / `(#12a)` / `(#)`,
  a lowercase `squashed commit` prefix, a leading-space
  prefix); counting (merges, markers, upstream, a commit
  that is both, `merge` default/explicit false, upstream
  commits never counted as markers even with marker-shaped
  subjects); defaults for `merge` / `published` /
  `upstream_commits` with the exact full result object;
  all three risk levels (unpublished with dirty history
  still low); all three strategies plus precedence (merge
  beats squash); exact steps arrays for all six
  published × strategy combinations; exact warnings
  (each alone, the >= 10 threshold at 9 (no warning) and
  10 (warning), the fixed text at 25, and all four together
  in pinned order with the exact full result object); and
  every validation path (missing / non-array / empty
  `commits`, per-entry object/hash/subject/merge errors at
  indexed paths, `upstream_commits` non-array and per-entry
  errors, non-boolean `published`, unknown extra fields
  ignored at top level and inside entries, a non-object
  top-level argument treated as {}, and no partial result
  on invalid input).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `plan` with no `--input` exits 2;
  `plan --input <missing file>` exits 1 naming the file;
  `plan --input <valid file>` exits 0 and prints the
  hand-checked plan (`commit_count 2, merge_commits 1,
  force_push_risk "high", recommended_strategy
  "rebase_with_merge_preservation"`) for the input with one
  merge commit, one upstream commit, and `published: true`;
  `plan --input <invalid file>` (`{"commits": []}`) exits 1
  with `commits must be a non-empty array`.
- Parity: `harness/parity.py` vs
  `harness/fixtures/rebaseplan-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/rebaseplan`, **128 package entries**.
Resolved versions match the sibling reference tree
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43). The subsequent offline
`npm install --ignore-scripts --offline`, build, tests,
and parity all ran against this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated
  test where applicable): (1) unknown extra fields are
  ignored rather than rejected, at top level and inside
  commit entries (the spec says extras are ignored);
  (2) a non-object top-level arguments value is treated
  as an empty object, so it fails as `commits is
  required` (the spec says a non-object top-level is
  treated as {}); (3) the squash-marker prefix test is
  case-sensitive and anchored at the subject start, so a
  lowercase or indented "squashed commit" is not a marker
  (the spec pins the exact prefix "Squashed commit" and
  the exact regex `/\(#\d+\)$/`); (4) error-message
  wording follows the fleet's path-naming pattern (e.g.
  `commits must be a non-empty array`,
  `commits[0].merge must be a boolean`). No other spec
  ambiguity was found in the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
